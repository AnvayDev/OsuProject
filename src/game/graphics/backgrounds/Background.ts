// Ported from osu.Game/Graphics/Backgrounds/Background.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BufferedContainer } from '@fw/graphics/containers/BufferedContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import { Anchor, Axes, FillMode } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';

/** A background which offers blurring via a BufferedContainer on demand. */
export class Background extends CompositeDrawable {
  readonly sprite: Sprite;

  private readonly textureName: string;

  private bufferedContainer: BufferedContainer | null = null;

  constructor(textureName = '') {
    super();

    this.textureName = textureName;
    this.relativeSizeAxes = Axes.Both;

    this.addInternal(this.sprite = new Sprite().with({
      relativeSizeAxes: Axes.Both,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      fillMode: FillMode.Fill,
    }));
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    if (this.textureName)
      this.sprite.texture = await dependencies.resolve(LargeTextureStore).get(this.textureName);
  }

  get blurSigma(): Vector2 {
    return (this.bufferedContainer?.blurSigma ?? Vector2.Zero).div(this.blurScale);
  }

  /** Smoothly adjusts the blur of this background over time. */
  blurTo(newBlurSigma: Vector2, duration = 0, easing = Easing.None): void {
    if (this.bufferedContainer === null && !newBlurSigma.equals(Vector2.Zero)) {
      this.removeInternal(this.sprite, false);

      this.addInternal(this.bufferedContainer = new BufferedContainer({ cachedFrameBuffer: true }).with({
        relativeSizeAxes: Axes.Both,
        redrawOnScale: false,
        child: this.sprite,
      }));
    }

    if (this.bufferedContainer !== null)
      this.transformBlurSigma(newBlurSigma, duration, easing);
  }

  private transformBlurSigma(newBlurSigma: Vector2, duration: number, easing: Easing): void {
    this.transformTo('blurSigmaInternal', newBlurSigma, duration, easing);
  }

  private blurSigmaBacking = Vector2.Zero;
  private blurScale = Vector2.One;

  /** C#'s private blurSigma property (the transform target). */
  protected get blurSigmaInternal(): Vector2 {
    return this.blurSigmaBacking;
  }

  protected set blurSigmaInternal(value: Vector2) {
    this.blurSigmaBacking = value;
    this.blurScale = new Vector2(calculateBlurDownscale(value.x), calculateBlurDownscale(value.y));

    this.bufferedContainer!.frameBufferScale = this.blurScale;
    this.bufferedContainer!.blurSigma = value.mul(this.blurScale); // If the image is scaled down, the blur radius also needs to be reduced to cover the same pixel block.
  }

  equals(other: Background | null): boolean {
    if (other === null) return false;
    if (this === other) return true;

    return other.constructor === this.constructor
      && other.textureName === this.textureName;
  }
}

function calculateBlurDownscale(sigma: number): number {
  // If we're blurring within one pixel, scaling down will always result in an undesirable loss of quality.
  // The algorithm below would also cause this value to go above 1, which is likewise undesirable.
  if (sigma <= 1)
    return 1;

  // A good value is one where the loss in quality as a result of downscaling the image is not easily perceivable.
  // The constants here have been experimentally chosen to yield nice transitions by approximating a log curve through the points {{ 1, 1 }, { 4, 0.75 }, { 16, 0.5 }, { 32, 0.25 }}.
  const scale = Math.fround(-0.18 * Math.log(Math.fround(0.004 * sigma)));

  // To reduce shimmering, the scaling transitions are limited to happen only in increments of 0.2.
  return Math.fround(Math.sign(scale) * Math.round(Math.abs(Math.fround(scale / 0.2))) * 0.2);
}
