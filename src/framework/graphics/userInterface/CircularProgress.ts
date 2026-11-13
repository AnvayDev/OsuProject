// Ported from osu.Framework/Graphics/UserInterface/CircularProgress.cs
// DOM: the CircularProgress shader becomes a CSS mask on the sprite: a conic gradient for the swept sector (clockwise from 12 o'clock, as
// the shader's pixel angle) intersected with a radial ring whose thickness is innerRadius of the radius (the shader's 2 * pathRadius).
// Not ported yet: RoundedCaps (no user so far).

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Invalidation } from '../../layout/Enums';
import type { TransformSequence } from '../../transforms/TransformSequence';
import { Easing, type IEasingFunction } from '../../transforms/Easing';
import type { Renderer } from '../rendering/Renderer';
import { CIRCULAR_PROGRESS_FS } from '../rendering/shaders';
import { Sprite } from '../sprites/Sprite';
import { Texture } from '../textures/Texture';

export class CircularProgress extends Sprite {
  private _progress = 0;

  get progress(): number {
    return this._progress;
  }

  set progress(value: number) {
    if (!Number.isFinite(value))
      throw new Error(`progress must be finite, but is ${value}.`);

    if (this._progress === value)
      return;

    this._progress = value;

    if (this.isLoaded)
      this.invalidate(Invalidation.DrawNode);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): void {
    super.load(dependencies);

    this.texture ??= Texture.WhitePixel;
  }

  progressTo(newValue: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('progress', newValue, duration, easing);
  }

  private _innerRadius = 1;

  get innerRadius(): number {
    return this._innerRadius;
  }

  set innerRadius(value: number) {
    if (!Number.isFinite(value))
      throw new Error(`innerRadius must be finite, but is ${value}.`);

    this._innerRadius = Math.min(Math.max(value, 0), 1);
    this.invalidate(Invalidation.DrawNode);
  }

  // #region DrawNode (Renderer): CircularProgressDrawNode
  // (the client triangulates the ring to save fill rate when InnerRadius <= 0.95; the pixels are the shader's either way, so the quad is drawn)

  protected override bindTextureShader(renderer: Renderer): void {
    renderer.bindShader(renderer.loadShader('CircularProgress', CIRCULAR_PROGRESS_FS));
    renderer.setShaderUniforms([
      { name: 'innerRadius', x: this._innerRadius },
      { name: 'progress', x: Math.abs(this._progress) },
      // smoothstep looks too sharp with 1px, let's give it a bit more
      { name: 'texelSize', x: 1.5 / (this.screenSpaceDrawQuad.width * renderer.pixelRatio) },
      { name: 'roundedCaps', x: 0, integer: true },
    ]);
  }

  override draw(renderer: Renderer): void {
    // Blit
    if (this._innerRadius === 0 || this._progress === 0)
      return;

    super.draw(renderer);

    renderer.bindShader(renderer.textureShader);
  }

  // #endregion

  protected override applyElementState(): void {
    super.applyElementState();

    const sweep = this._progress >= 1 ? 360 : Math.max(0, this._progress) * 360;
    const inner = (1 - this._innerRadius) * 100;
    const mask = `conic-gradient(#000 ${sweep}deg, transparent ${sweep}deg), `
      + `radial-gradient(closest-side, transparent ${inner}%, #000 ${inner}%, #000 100%, transparent 100%)`;

    // (written only when changed, also by Sprite.applyElementState: re-parsing the gradients on every DrawInfo invalidation is costly)
    const maskChanged = this.setElementStyle('mask', mask);
    this.setElementStyle('-webkit-mask', mask);
    // a mask shorthand resets its composite mode
    this.setElementStyle('mask-composite', 'intersect', maskChanged);
    this.setElementStyle('-webkit-mask-composite', 'source-in', maskChanged);
  }
}
