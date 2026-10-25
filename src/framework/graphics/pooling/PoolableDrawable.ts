// Ported from osu.Framework/Graphics/Pooling/PoolableDrawable.cs

import { Invalidation } from '../../layout/Enums';
import { InvalidationSource } from '../../layout/Layout';
import { CompositeDrawable } from '../containers/CompositeDrawable';
import type { IDrawablePool } from './IDrawablePool';

export class PoolableDrawable extends CompositeDrawable {
  override get disposeOnDeathRemoval(): boolean {
    return this.pool === null && super.disposeOnDeathRemoval;
  }

  private _isInUse = false;

  /** Whether this pooled drawable is currently in use. */
  get isInUse(): boolean {
    return this._isInUse;
  }

  /** Whether this drawable is currently managed by a pool. */
  get isInPool(): boolean {
    return this.pool !== null;
  }

  private pool: IDrawablePool | null = null;

  /** A flag to keep the drawable present to guarantee the prepare call can be performed as a scheduled call. */
  private waitingForPrepare = false;

  override get isPresent(): boolean {
    return this.waitingForPrepare || super.isPresent;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // this allows a PooledDrawable to still function outside of a pool.
    if (!this.isInPool)
      this.assign();
  }

  /** Return this drawable to its pool manually. Note that this is not required if the drawable is using lifetime cleanup. */
  return(): void {
    if (!this._isInUse)
      throw new Error('This PoolableDrawable was already returned');

    this._isInUse = false;

    this.freeAfterUse();

    // intentionally don't throw if a pool was not associated or otherwise.
    // supports use of PooledDrawables outside of a pooled scenario without special handling.
    this.pool?.return(this);
    this.waitingForPrepare = false;
  }

  /**
   * Perform any initialisation on new usage of this drawable.
   * This is scheduled to the first update frame and may not be run if this is never reached.
   */
  protected prepareForUse(): void {
  }

  /**
   * Perform any clean-up required before returning this drawable to a pool.
   * This is called regardless of whether prepareForUse was executed.
   */
  protected freeAfterUse(): void {
  }

  /**
   * @internal Set the associated pool this drawable is currently associated with.
   * pool: the target pool, or null to disassociate from all pools (and cause the drawable to be disposed as if it was not pooled).
   * Throws if this drawable is still in use, or is already in another pool.
   */
  setPool(pool: IDrawablePool | null): void {
    if (this._isInUse)
      throw new Error('This PoolableDrawable is still in use');

    if (pool !== null && this.pool !== null)
      throw new Error('This PoolableDrawable is already in a pool');

    this.pool = pool;
  }

  /** @internal Assign this drawable to a consumer. Throws if this drawable is still in use. */
  assign(): void {
    if (this._isInUse)
      throw new Error('This PoolableDrawable is already in use');

    this._isInUse = true;

    // prepare call is performed on Update() as it may contain user code dependent on the clock being updated.
    this.waitingForPrepare = true;
  }

  protected override update(): void {
    if (this.waitingForPrepare) {
      this.prepareForUse();
      this.waitingForPrepare = false;
    }

    super.update();
  }

  protected override onInvalidate(invalidation: Invalidation, source: InvalidationSource): boolean {
    if (source !== InvalidationSource.Child && (invalidation & Invalidation.Parent) !== 0) {
      if (this._isInUse && this.parent === null)
        this.return();
    }

    return super.onInvalidate(invalidation, source);
  }
}
