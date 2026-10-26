// Ported from osu.Game/Graphics/UserInterface/StarCounter.cs

import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes, type FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { lerp, valueAt } from '@fw/transforms/Interpolation';

const star_spacing = 4;

export abstract class Star extends CompositeDrawable {
  abstract displayAt(scale: number): void;
}

const scaling_duration = 1000;

const fading_duration = 100;

const scaling_easing = Easing.OutElasticHalf;

const min_star_scale = 0.4;

const star_size = 20;

export class DefaultStar extends Star {
  readonly icon: SpriteIcon;

  constructor() {
    super();

    this.size = new Vector2(star_size);

    this.internalChild = this.icon = new SpriteIcon().with({
      size: new Vector2(star_size),
      icon: FontAwesome.Solid.Star,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
    });
  }

  override displayAt(scale: number): void {
    scale = Math.fround(lerp(min_star_scale, 1, Math.min(Math.max(scale, 0), 1)));

    this.fadeTo(scale, fading_duration);
    this.icon.scaleTo(scale, scaling_duration, scaling_easing);
  }
}

export class StarCounter extends Container {
  private readonly stars: FillFlowContainer<Star>;

  /**
   * Maximum amount of stars displayed.
   * This does not limit the counter value, but the amount of stars displayed.
   */
  readonly starCount: number;

  /** The added delay for each subsequent star to be animated. */
  protected get animationDelay(): number {
    return 80;
  }

  set direction(value: FillDirection) {
    this.stars.direction = value;
  }

  private _current = 0;

  /** Amount of stars represented. */
  get current(): number {
    return this._current;
  }

  set current(value: number) {
    value = Math.fround(value);

    if (this._current === value) return;

    if (this.isLoaded)
      this.animateStars(value);
    this._current = value;
  }

  /** Shows a float count as stars. Used as star difficulty display. */
  constructor(starCount = 10) {
    super();

    this.starCount = Math.max(starCount, 0);

    this.autoSizeAxes = Axes.Both;

    this.children = [
      this.stars = new FillFlowContainer<Star>().with({
        autoSizeAxes: Axes.Both,
        spacing: new Vector2(star_spacing),
        children: Array.from({ length: this.starCount }, () => this.createStar()),
      }),
    ];
  }

  createStar(): Star {
    return new DefaultStar();
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // Animate initial state from zero.
    this.replayAnimation();
  }

  resetCount(): void {
    this._current = 0;
    this.stopAnimation();
  }

  replayAnimation(): void {
    const t = this._current;
    this.resetCount();
    this.current = t;
  }

  stopAnimation(): void {
    this.animateStars(this._current);
    for (const star of this.stars.children)
      star.finishTransforms(true);
  }

  private getStarScale(i: number, value: number): number {
    return i + 1 <= value ? 1.0 : Math.fround(valueAt(value, 0, 1.0, i, i + 1));
  }

  // (C#'s animate(); renamed as Transformable.animate() exists.)
  private animateStars(newValue: number): void {
    for (let i = 0; i < this.stars.children.length; i++) {
      const star = this.stars.children[i];

      star.clearTransforms(true);

      const delay = Math.max(this._current <= newValue ? i - this._current : Math.min(this._current, this.starCount) - 1 - i, 0) * this.animationDelay;

      const s = star.beginDelayedSequence(delay);
      try {
        star.displayAt(this.getStarScale(i, newValue));
      } finally {
        s.dispose();
      }
    }
  }
}
