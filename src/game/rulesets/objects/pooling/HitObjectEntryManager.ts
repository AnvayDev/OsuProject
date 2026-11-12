// Ported from osu.Game/Rulesets/Objects/Pooling/HitObjectEntryManager.cs

import { Signal } from '@fw/bindables/Signal';
import type { HitObject } from '../HitObject';
import { type HitObjectLifetimeEntry, SyntheticHitObjectEntry } from '../HitObjectLifetimeEntry';

/** Manages a mapping between HitObject and HitObjectLifetimeEntry. */
export class HitObjectEntryManager {
  /** All entries, including entries of the nested hit objects. */
  get allEntries(): Iterable<HitObjectLifetimeEntry> {
    return this.entryMap.values();
  }

  /** Invoked when a new HitObjectLifetimeEntry is added to this HitObjectEntryManager. The second parameter of the event is the parent hit object. */
  readonly onEntryAdded = new Signal<[HitObjectLifetimeEntry, HitObject | null]>();

  /** Invoked when a HitObjectLifetimeEntry is removed from this HitObjectEntryManager. The second parameter of the event is the parent hit object. */
  readonly onEntryRemoved = new Signal<[HitObjectLifetimeEntry, HitObject | null]>();

  /** Provides the reverse mapping of HitObjectLifetimeEntry.HitObject for each entry. */
  private readonly entryMap = new Map<HitObject, HitObjectLifetimeEntry>();

  /** Stores the parent hit object for entries of the nested hit objects. The parent hit object of a pooled hit object may be non-pooled. In that case, no corresponding HitObjectLifetimeEntry is stored in this HitObjectEntryManager. */
  private readonly parentMap = new Map<HitObjectLifetimeEntry, HitObject>();

  add(entry: HitObjectLifetimeEntry, parent: HitObject | null): void {
    const hitObject = entry.hitObject;

    if (this.entryMap.has(hitObject))
      throw new Error('The HitObjectLifetimeEntry is already added to this HitObjectEntryManager.');

    this.entryMap.set(hitObject, entry);

    // If the entry has a parent, set it and add the entry to the parent's children.
    if (parent !== null) {
      this.parentMap.set(entry, parent);
      this.entryMap.get(parent)?.nestedEntries.push(entry);
    }

    hitObject.defaultsApplied.add(this.onDefaultsApplied);
    this.onEntryAdded.emit([entry, parent]);
  }

  remove(entry: HitObjectLifetimeEntry): boolean {
    if (entry instanceof SyntheticHitObjectEntry)
      return false;

    const hitObject = entry.hitObject;

    if (!this.entryMap.delete(hitObject))
      throw new Error('The HitObjectLifetimeEntry is not contained in this HitObjectEntryManager.');

    // If the entry has a parent, unset it and remove the entry from the parents' children.
    const parent = this.parentMap.get(entry) ?? null;

    if (parent !== null) {
      this.parentMap.delete(entry);

      const parentEntry = this.entryMap.get(parent);

      if (parentEntry !== undefined) {
        const index = parentEntry.nestedEntries.indexOf(entry);
        if (index >= 0)
          parentEntry.nestedEntries.splice(index, 1);
      }
    }

    // Remove all the entries' children.
    for (const childEntry of [...entry.nestedEntries])
      this.remove(childEntry);

    hitObject.defaultsApplied.remove(this.onDefaultsApplied);
    this.onEntryRemoved.emit([entry, parent]);
    return true;
  }

  tryGet(hitObject: HitObject): HitObjectLifetimeEntry | null {
    return this.entryMap.get(hitObject) ?? null;
  }

  /** As nested hit objects are recreated, remove entries of the old nested hit objects. */
  private readonly onDefaultsApplied = (hitObject: HitObject): void => {
    const entry = this.entryMap.get(hitObject);

    if (entry === undefined)
      return;

    // Replace the entire list rather than clearing to prevent circular traversal later.
    const previousEntries = entry.nestedEntries;
    entry.nestedEntries = [];

    // Remove all the entries' children. At this point the parents' (this entries') children list has been reconstructed, so this does not cause upwards traversal.
    for (const nested of previousEntries)
      this.remove(nested);
  };
}
