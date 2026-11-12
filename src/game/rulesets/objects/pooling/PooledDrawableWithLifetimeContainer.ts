// Ported from osu.Game/Rulesets/Objects/Pooling/PooledDrawableWithLifetimeContainer.cs

import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { Drawable } from '@fw/graphics/Drawable';
import { LifetimeBoundaryCrossingDirection, LifetimeBoundaryKind, type LifetimeEntry } from '@fw/graphics/performance/LifetimeEntry';
import { LifetimeEntryManager } from '@fw/graphics/performance/LifetimeEntryManager';

/**
 * A container of TDrawables dynamically added/removed by model TEntrys.
 * When an entry became alive, a drawable corresponding to the entry is obtained (potentially pooled), and added to this container.
 * The drawable is removed when the entry became dead.
 */
export abstract class PooledDrawableWithLifetimeContainer<TEntry extends LifetimeEntry, TDrawable extends Drawable> extends CompositeDrawable {
  /** All entries added to this container, including dead entries. The enumeration order is undefined. */
  get entries(): Iterable<TEntry> {
    return this.allEntries;
  }

  private readonly aliveDrawableMap = new Map<TEntry, TDrawable>();

  /** All alive entries and drawables corresponding to the entries. The enumeration order is undefined. */
  get aliveEntries(): ReadonlyMap<TEntry, TDrawable> {
    return this.aliveDrawableMap;
  }

  /** Whether to remove an entry when clock goes backward and crossed its LifetimeStart. Used when entries are dynamically added at its TEntry.LifetimeStart to prevent duplicated entries. */
  protected get removeRewoundEntry(): boolean {
    return false;
  }

  /** @internal The amount of time prior to the current time within which entries should be considered alive. */
  pastLifetimeExtension = 0;

  /** @internal The amount of time after the current time within which entries should be considered alive. */
  futureLifetimeExtension = 0;

  private readonly allEntries = new Set<TEntry>();

  private readonly lifetimeManager = new LifetimeEntryManager();

  constructor() {
    super();

    this.lifetimeManager.entryBecameAlive.add(entry => this.entryBecameAlive(entry as TEntry));
    this.lifetimeManager.entryBecameDead.add(entry => this.entryBecameDead(entry as TEntry));
    this.lifetimeManager.entryCrossedBoundary.add(([entry, kind, direction]) => this.entryCrossedBoundary(entry as TEntry, kind, direction));
  }

  /** Add a TEntry to be managed by this container. The aliveness of the entry is not updated until checkChildrenLife. */
  addEntry(entry: TEntry): void {
    this.allEntries.add(entry);
    this.lifetimeManager.addEntry(entry);
  }

  /** Remove a TEntry from this container. If the entry was alive, the corresponding drawable is removed. Returns whether the entry was in this container. */
  removeEntry(entry: TEntry): boolean {
    if (!this.lifetimeManager.removeEntry(entry)) return false;

    this.allEntries.delete(entry);
    return true;
  }

  /** Initialize new TDrawable corresponding entry. */
  protected abstract getDrawable(entry: TEntry): TDrawable;

  private entryBecameAlive(entry: TEntry): void {
    const drawable = this.getDrawable(entry);
    this.aliveDrawableMap.set(entry, drawable);
    this.addDrawable(entry, drawable);
  }

  /** Add a TDrawable corresponding to entry to this container. Invoked when the entry became alive. */
  protected addDrawable(_entry: TEntry, drawable: TDrawable): void {
    this.addInternal(drawable);
  }

  private entryBecameDead(entry: TEntry): void {
    const drawable = this.aliveDrawableMap.get(entry)!;
    this.aliveDrawableMap.delete(entry);
    this.removeDrawable(entry, drawable);
  }

  /** Remove a TDrawable corresponding to entry from this container. Invoked when the entry became dead. */
  protected removeDrawable(_entry: TEntry, drawable: TDrawable): void {
    this.removeInternal(drawable, false);
  }

  private entryCrossedBoundary(entry: TEntry, kind: LifetimeBoundaryKind, direction: LifetimeBoundaryCrossingDirection): void {
    if (this.removeRewoundEntry && kind === LifetimeBoundaryKind.Start && direction === LifetimeBoundaryCrossingDirection.Backward)
      this.removeEntry(entry);
  }

  /** Remove all TEntrys. */
  clearEntries(): void {
    for (const entry of [...this.allEntries])
      this.removeEntry(entry);
  }

  protected override checkChildrenLife(): boolean {
    if (!this.isPresent)
      return false;

    const current = this.time.current;
    let aliveChanged = this.lifetimeManager.update(current - this.pastLifetimeExtension, current + this.futureLifetimeExtension);
    aliveChanged = super.checkChildrenLife() || aliveChanged;
    return aliveChanged;
  }
}
