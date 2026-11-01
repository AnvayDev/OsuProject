// Ported from osu.Framework/Graphics/UserInterface/CircularProgress.cs
// DOM: the CircularProgress shader becomes a CSS mask on the sprite: a conic gradient for the swept sector (clockwise from 12 o'clock, as
// the shader's pixel angle) intersected with a radial ring whose thickness is innerRadius of the radius (the shader's 2 * pathRadius).
// Not ported yet: RoundedCaps (no user so far).

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Invalidation } from '../../layout/Enums';
import type { TransformSequence } from '../../transforms/TransformSequence';
import { Easing, type IEasingFunction } from '../../transforms/Easing';
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

  private appliedMask = '';
  private appliedTexture: Texture | null = null;

  protected override applyElementState(): void {
    super.applyElementState();

    const sweep = this._progress >= 1 ? 360 : Math.max(0, this._progress) * 360;
    const inner = (1 - this._innerRadius) * 100;
    const mask = `conic-gradient(#000 ${sweep}deg, transparent ${sweep}deg), `
      + `radial-gradient(closest-side, transparent ${inner}%, #000 ${inner}%, #000 100%, transparent 100%)`;

    // Sprite.applyElementState only resets the mask when the texture changes (a white pixel never writes one after its first application).
    // Re-parsing these gradients for every DrawInfo invalidation (e.g. each scrolled frame) is costly, so write only on change.
    if (mask === this.appliedMask && this.texture === this.appliedTexture)
      return;

    this.appliedMask = mask;
    this.appliedTexture = this.texture;

    const style = this.element.style;
    style.setProperty('mask', mask);
    style.setProperty('-webkit-mask', mask);
    style.setProperty('mask-composite', 'intersect');
    style.setProperty('-webkit-mask-composite', 'source-in');
  }
}
