// Ported from osu.Framework/Graphics/Pooling/IDrawablePool.cs

import type { PoolableDrawable } from './PoolableDrawable';

export interface IDrawablePool {
  /**
   * Get a drawable from this pool.
   * setupAction: an optional action to be performed on this drawable immediately after retrieval. Should generally be used to prepare the drawable into a usable state.
   */
  get(setupAction?: ((d: PoolableDrawable) => void) | null): PoolableDrawable;

  /** Return a drawable after use. pooledDrawable: the drawable to return. Should have originally come from this pool. */
  return(pooledDrawable: PoolableDrawable): void;
}
