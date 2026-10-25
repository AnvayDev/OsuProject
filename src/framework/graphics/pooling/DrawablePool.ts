// Ported from osu.Framework/Graphics/Pooling/DrawablePool.cs
// C#'s `where T : PoolableDrawable, new()` becomes a constructor argument: `new DrawablePool<T>(100)` is `new DrawablePool(T, 100)`.
// GlobalStatistics (DrawablePoolUsageStatistic) are not ported; the counters are kept as properties.

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { LoadState } from '../../layout/Enums';
import { CompositeDrawable } from '../containers/CompositeDrawable';
import type { IDrawablePool } from './IDrawablePool';
import type { PoolableDrawable } from './PoolableDrawable';

/**
 * A component which provides a pool of reusable drawables.
 * Should be used to reduce allocation and construction overhead of individual drawables.
 *
 * The initialSize drawables will be prepared ahead-of-time during this pool's asynchronous load procedure.
 * Drawables exceeding the pool's available size will not be asynchronously loaded as it is assumed they are immediately required for consumption.
 */
export class DrawablePool<T extends PoolableDrawable> extends CompositeDrawable implements IDrawablePool {
  private readonly initialSize: number;
  private readonly maximumSize: number | null;

  private readonly pool: T[] = [];

  /**
   * Create a new pool instance.
   * type: the type of drawable to be pooled (C#'s T).
   * initialSize: the number of drawables to be prepared for initial consumption.
   * maximumSize: an optional maximum size after which the pool will no longer be expanded.
   */
  constructor(private readonly type: new () => T, initialSize: number, maximumSize: number | null = null) {
    super();

    if (maximumSize !== null && initialSize > maximumSize)
      throw new RangeError('Initial size must be less than or equal to maximum size.');

    this.maximumSize = maximumSize;
    this.initialSize = initialSize;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    for (let i = 0; i < this.initialSize; i++)
      this.pool.push(this.create());
    this._currentPoolSize = this.initialSize;

    // LoadComponents(pool.ToArray())
    for (const d of this.pool)
      this.loadComponent(d);

    return r;
  }

  /** Return a drawable after use. pooledDrawable: the drawable to return. Should have originally come from this pool. */
  return(pooledDrawable: PoolableDrawable): void {
    if (!(pooledDrawable instanceof this.type))
      throw new TypeError('Invalid type');

    if (pooledDrawable.parent !== null)
      throw new Error('Drawable was attempted to be returned to pool while still in a hierarchy');

    if (pooledDrawable.isInUse) {
      // if the return operation didn't come from the drawable, redirect to ensure consistent behaviour.
      pooledDrawable.return();
      return;
    }

    //TODO: check the drawable was sourced from this pool for safety.

    if (this.maximumSize !== null && this.countAvailable >= this.maximumSize) {
      // if the drawable can't be returned to the pool, mark it as such so it can be disposed of.
      pooledDrawable.setPool(null);

      // then attempt disposal.
      if (pooledDrawable.disposeOnDeathRemoval)
        this.disposeChildAsync(pooledDrawable);
    } else {
      this.pool.push(pooledDrawable);
    }

    this._countInUse--;
  }

  /**
   * Get a drawable from this pool.
   * setupAction: an optional action to be performed on this drawable immediately after retrieval. Should generally be used to prepare the drawable into a usable state.
   */
  get(setupAction: ((d: T) => void) | null = null): T {
    if (this.loadState <= LoadState.Loading)
      throw new Error('A DrawablePool must be in a loaded state before retrieving pooled drawables.');

    let drawable = this.pool.pop();

    if (drawable === undefined) {
      drawable = this.create();

      if (this.maximumSize === null || this._currentPoolSize < this.maximumSize)
        this._currentPoolSize++;
      else
        this._countExcessConstructed++;

      if (this.loadState >= LoadState.Loading)
        this.loadComponent(drawable);
    }

    this._countInUse++;

    drawable.assign();
    drawable.lifetimeStart = -Number.MAX_VALUE;
    drawable.lifetimeEnd = Number.MAX_VALUE;

    setupAction?.(drawable);

    return drawable;
  }

  /** Create a new drawable to be consumed or added to the pool. */
  protected createNewDrawable(): T {
    return new this.type();
  }

  private create(): T {
    const drawable = this.createNewDrawable();

    drawable.setPool(this);

    return drawable;
  }

  protected override disposeInternal(isDisposing: boolean): void {
    if (this.isDisposed)
      return;

    super.disposeInternal(isDisposing);

    for (const p of this.pool)
      p.dispose();

    this._countInUse = 0;
    this._countExcessConstructed = 0;
    this._currentPoolSize = 0;
  }

  private _currentPoolSize = 0;

  /** The current size of the pool. */
  get currentPoolSize(): number {
    return this._currentPoolSize;
  }

  private _countInUse = 0;

  /** The number of drawables currently in use. */
  get countInUse(): number {
    return this._countInUse;
  }

  private _countExcessConstructed = 0;

  /** The total number of drawables constructed that were not pooled. */
  get countExcessConstructed(): number {
    return this._countExcessConstructed;
  }

  /** The number of drawables currently available for consumption. */
  get countAvailable(): number {
    return this.pool.length;
  }
}
