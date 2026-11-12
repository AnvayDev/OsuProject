// Ported from osu.Game/Rulesets/Objects/Pooling/PoolableDrawableWithLifetime.cs

import type { LifetimeEntry } from '@fw/graphics/performance/LifetimeEntry';
import { PoolableDrawable } from '@fw/graphics/pooling/PoolableDrawable';
import { LoadState } from '@fw/layout/Enums';

/** A PoolableDrawable that is controlled by an entry to implement drawable pooling and replay rewinding. */
export abstract class PoolableDrawableWithLifetime<TEntry extends LifetimeEntry> extends PoolableDrawable {
  private entryBacking: TEntry | null = null;

  /**
   * The entry holding essential state of this PoolableDrawableWithLifetime.
   * If a non-null value is set before loading is started, the entry is applied when the loading is completed.
   * It is not valid to set an entry while this PoolableDrawableWithLifetime is loading.
   */
  get entry(): TEntry | null {
    return this.entryBacking;
  }

  set entry(value: TEntry | null) {
    if (this.loadState === LoadState.NotLoaded)
      this.entryBacking = value;
    else if (value !== null)
      this.apply(value);
    else if (this.hasEntryApplied)
      this.free();
  }

  /** Whether entry is applied to this PoolableDrawableWithLifetime. When an initial entry is specified in the constructor, this is set to true after the loading is completed. */
  protected hasEntryApplied = false;

  override get lifetimeStart(): number {
    return super.lifetimeStart;
  }

  override set lifetimeStart(value: number) {
    if (this.entryBacking === null && this.lifetimeStart !== value)
      throw new Error('Cannot modify lifetime of PoolableDrawableWithLifetime when entry is not set');

    if (this.entryBacking !== null)
      this.entryBacking.lifetimeStart = value;
  }

  override get lifetimeEnd(): number {
    return super.lifetimeEnd;
  }

  override set lifetimeEnd(value: number) {
    if (this.entryBacking === null && this.lifetimeEnd !== value)
      throw new Error('Cannot modify lifetime of PoolableDrawableWithLifetime when entry is not set');

    if (this.entryBacking !== null)
      this.entryBacking.lifetimeEnd = value;
  }

  override get removeWhenNotAlive(): boolean {
    return false;
  }

  override get removeCompletedTransforms(): boolean {
    return false;
  }

  override set removeCompletedTransforms(_value: boolean) {
  }

  constructor(initialEntry: TEntry | null = null) {
    super();

    this.entry = initialEntry;
  }

  protected override loadAsyncComplete(): void {
    super.loadAsyncComplete();

    // Apply the initial entry.
    if (this.entryBacking !== null && !this.hasEntryApplied)
      this.applyInternal(this.entryBacking);
  }

  /** Applies a new entry to be represented by this drawable. If there is an existing entry applied, the entry will be replaced. */
  apply(entry: TEntry): void {
    if (this.loadState === LoadState.Loading)
      throw new Error('Cannot apply a new entry while currently loading.');

    this.applyInternal(entry);
  }

  protected override freeAfterUse(): void {
    super.freeAfterUse();

    // We preserve the existing entry in case we want to move a non-pooled drawable between different parent drawables.
    if (this.hasEntryApplied && this.isInPool)
      this.free();
  }

  /** Invoked to apply a new entry to this drawable. */
  protected onApply(_entry: TEntry): void {
  }

  /** Invoked to revert application of the entry to this drawable. */
  protected onFree(_entry: TEntry): void {
  }

  private applyInternal(entry: TEntry): void {
    if (this.hasEntryApplied)
      this.free();

    this.entryBacking = entry;
    entry.lifetimeChanged.add(this.setLifetimeFromEntry);
    this.setLifetimeFromEntry(entry);

    this.onApply(entry);

    this.hasEntryApplied = true;
  }

  private free(): void {
    const entry = this.entryBacking!;

    this.onFree(entry);

    entry.lifetimeChanged.remove(this.setLifetimeFromEntry);
    this.entryBacking = null;
    super.lifetimeStart = -Number.MAX_VALUE;
    super.lifetimeEnd = Number.MAX_VALUE;

    this.hasEntryApplied = false;
  }

  private readonly setLifetimeFromEntry = (entry: LifetimeEntry): void => {
    super.lifetimeStart = entry.lifetimeStart;
    super.lifetimeEnd = entry.lifetimeEnd;
  };
}
