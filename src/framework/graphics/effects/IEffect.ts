// Ported from osu.Framework/Graphics/Effects/IEffect.cs and Drawable.WithEffect (a module function, as Drawable.ts can't import effects).

import type { Drawable } from '../Drawable';

/** Represents an effect that can be applied to a drawable. */
export interface IEffect<T extends Drawable> {
  /** Applies this effect to the given drawable. */
  applyTo(drawable: Drawable): T;
}

/** Applies the given effect to the drawable and optionally initializes the created drawable with the given initializationAction. */
export function withEffect<T extends Drawable>(drawable: Drawable, effect: IEffect<T>, initializationAction: ((d: T) => void) | null = null): T {
  const result = effect.applyTo(drawable);
  initializationAction?.(result);
  return result;
}
