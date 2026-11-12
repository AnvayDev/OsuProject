// Ported from osu.Framework/Graphics/Performance/LifetimeEntryManager.cs

import { Signal } from '../../bindables/Signal';
import { SortedList } from '../../lists/SortedList';
import { LifetimeBoundaryCrossingDirection, LifetimeBoundaryKind, type LifetimeEntry, LifetimeEntryState } from './LifetimeEntry';

/**
 * Provides time-optimised updates for lifetime change notifications.
 * This is used in specialised CompositeDrawables to optimise lifetime changes (see: LifetimeManagementContainer).
 *
 * The time complexity of updating lifetimes is O(number of alive items).
 */
export class LifetimeEntryManager {
  /** Invoked immediately when a LifetimeEntry becomes alive. */
  readonly entryBecameAlive = new Signal<LifetimeEntry>();

  /** Invoked immediately when a LifetimeEntry becomes dead. */
  readonly entryBecameDead = new Signal<LifetimeEntry>();

  /**
   * Invoked when a LifetimeEntry crosses a lifetime boundary.
   * If multiple boundaries are crossed during a single update call, then this event is invoked once per boundary, in the order of crossing.
   */
  readonly entryCrossedBoundary = new Signal<[LifetimeEntry, LifetimeBoundaryKind, LifetimeBoundaryCrossingDirection]>();

  /** Contains all the newly-added (but not yet processed) entries. */
  private readonly newEntries: LifetimeEntry[] = [];

  /** Contains all the currently-alive entries. */
  private activeEntries: LifetimeEntry[] = [];

  /** Contains all entries that should come alive in the future. */
  private readonly futureEntries = new SortedList<LifetimeEntry>(lifetimeStartComparator);

  /** Contains all entries that were alive in the past. */
  private readonly pastEntries = new SortedList<LifetimeEntry>(lifetimeEndComparator);

  private readonly eventQueue: [LifetimeEntry, LifetimeBoundaryKind, LifetimeBoundaryCrossingDirection][] = [];

  /** Used to ensure a stable sort if multiple entries with the same lifetime are added. */
  private currentChildId = 0;

  /** Adds an entry. */
  addEntry(entry: LifetimeEntry): void {
    entry.requestLifetimeUpdate.add(this.requestLifetimeUpdate);
    entry.childId = ++this.currentChildId;
    entry.state = LifetimeEntryState.New;

    this.newEntries.push(entry);
  }

  /** Removes an entry. Returns whether it was contained by this LifetimeEntryManager. */
  removeEntry(entry: LifetimeEntry): boolean {
    entry.requestLifetimeUpdate.remove(this.requestLifetimeUpdate);

    let removed = false;

    switch (entry.state) {
      case LifetimeEntryState.New:
        removed = removeFrom(this.newEntries, entry);
        break;

      case LifetimeEntryState.Current:
        removed = removeFrom(this.activeEntries, entry);

        if (removed)
          this.entryBecameDead.emit(entry);

        break;

      case LifetimeEntryState.Past:
        // Past entries may be found in the newEntries set after a lifetime change (see requestLifetimeUpdate).
        removed = this.pastEntries.remove(entry) || removeFrom(this.newEntries, entry);
        break;

      case LifetimeEntryState.Future:
        // Future entries may be found in the newEntries set after a lifetime change (see requestLifetimeUpdate).
        removed = this.futureEntries.remove(entry) || removeFrom(this.newEntries, entry);
        break;
    }

    if (!removed)
      return false;

    entry.childId = 0;
    return true;
  }

  /** Removes all entries. */
  clearEntries(): void {
    for (const entry of this.newEntries) {
      entry.requestLifetimeUpdate.remove(this.requestLifetimeUpdate);
      entry.childId = 0;
    }

    for (const entry of this.pastEntries.toArray()) {
      entry.requestLifetimeUpdate.remove(this.requestLifetimeUpdate);
      entry.childId = 0;
    }

    for (const entry of this.activeEntries) {
      entry.requestLifetimeUpdate.remove(this.requestLifetimeUpdate);
      this.entryBecameDead.emit(entry);
      entry.childId = 0;
    }

    for (const entry of this.futureEntries.toArray()) {
      entry.requestLifetimeUpdate.remove(this.requestLifetimeUpdate);
      entry.childId = 0;
    }

    this.newEntries.length = 0;
    this.pastEntries.removeAll(() => true);
    this.activeEntries.length = 0;
    this.futureEntries.removeAll(() => true);
  }

  /** Invoked when the lifetime of an entry is going to changed. */
  private readonly requestLifetimeUpdate = (entry: LifetimeEntry): void => {
    // Entries in the past/future sets need to be re-sorted to prevent the comparer from becoming unstable.
    // To prevent, e.g. CompositeDrawable alive children changing during enumeration, the entry's state must not be updated immediately.
    //
    // In order to achieve the above, the entry is first removed from the past/future set (resolving the comparator stability issues)
    // and then re-queued back onto the new entries list to be re-processed in the next Update().
    //
    // Note that this does not apply to entries that are in the current set, as they don't utilise a lifetime comparer.

    const futureOrPastSet = this.futureOrPastEntries(entry.state);

    if (futureOrPastSet?.remove(entry) === true) {
      // Enqueue the entry to be processed in the next Update().
      this.newEntries.push(entry);
    }
  };

  /** Retrieves the sorted set for a LifetimeEntryState, or null if the entry is neither in the past nor the future. */
  private futureOrPastEntries(state: LifetimeEntryState): SortedList<LifetimeEntry> | null {
    switch (state) {
      case LifetimeEntryState.Future:
        return this.futureEntries;

      case LifetimeEntryState.Past:
        return this.pastEntries;

      default:
        return null;
    }
  }

  /**
   * Updates the lifetime of entries within a time range. The range is treated as a closed interval.
   * Returns whether the state of any entries changed.
   */
  update(startTime: number, endTime = startTime): boolean {
    endTime = Math.max(endTime, startTime);

    let aliveChildrenChanged = false;

    // Check for newly-added entries.
    for (const entry of this.newEntries)
      aliveChildrenChanged = this.updateChildEntry(entry, startTime, endTime, true, true) || aliveChildrenChanged;

    this.newEntries.length = 0;

    // Check for newly alive entries when time is increased.
    while (this.futureEntries.count > 0) {
      const entry = this.futureEntries.get(0);

      if (getState(entry, startTime, endTime) === LifetimeEntryState.Future)
        break;

      this.futureEntries.removeAt(0);
      aliveChildrenChanged = this.updateChildEntry(entry, startTime, endTime, false, true) || aliveChildrenChanged;
    }

    // Check for newly alive entries when time is decreased.
    while (this.pastEntries.count > 0) {
      const entry = this.pastEntries.get(this.pastEntries.count - 1);

      if (getState(entry, startTime, endTime) === LifetimeEntryState.Past)
        break;

      this.pastEntries.removeAt(this.pastEntries.count - 1);
      aliveChildrenChanged = this.updateChildEntry(entry, startTime, endTime, false, true) || aliveChildrenChanged;
    }

    // Checks for newly dead entries when time is increased/decreased.
    for (const entry of this.activeEntries)
      aliveChildrenChanged = this.updateChildEntry(entry, startTime, endTime, false, false) || aliveChildrenChanged;

    // Remove all newly-dead entries.
    if (this.activeEntries.some(e => e.state !== LifetimeEntryState.Current))
      this.activeEntries = this.activeEntries.filter(e => e.state === LifetimeEntryState.Current);

    while (this.eventQueue.length !== 0)
      this.entryCrossedBoundary.emit(this.eventQueue.shift()!);

    return aliveChildrenChanged;
  }

  /**
   * Updates the state of a single LifetimeEntry.
   * @param isNewEntry Whether the entry was in newEntries.
   * @param mutateActiveEntries Whether activeEntries should be mutated by this invocation. If false, the caller is expected to handle mutation of activeEntries based on any changes to the entry's state.
   * @returns Whether the state of the entry has changed.
   */
  private updateChildEntry(entry: LifetimeEntry, startTime: number, endTime: number, isNewEntry: boolean, mutateActiveEntries: boolean): boolean {
    const oldState = entry.state;

    // The entry can be in one of three states:
    // 1. The entry was previously in the past/future sets but a lifetime change was requested. Its state is currently "past"/"future".
    // 2. The entry is a completely new entry. Its state is currently "new".
    // 3. The entry is currently-active. Its state is "current" but it's also in the active set.

    const newState = getState(entry, startTime, endTime);

    if (newState === oldState) {
      // If the state hasn't changed, then there's two possibilities:
      // 1. The entry was in the past/future sets and a lifetime change was requested. The entry needs to be added back to the past/future sets.
      // 2. The entry is and continues to remain active.
      if (isNewEntry)
        this.futureOrPastEntries(newState)?.add(entry);

      // In both cases, the entry doesn't need to be processed further as it's already in the correct state.
      return false;
    }

    let aliveEntriesChanged = false;

    if (newState === LifetimeEntryState.Current) {
      if (mutateActiveEntries)
        this.activeEntries.push(entry);

      this.entryBecameAlive.emit(entry);
      aliveEntriesChanged = true;
    } else if (oldState === LifetimeEntryState.Current) {
      if (mutateActiveEntries)
        removeFrom(this.activeEntries, entry);

      this.entryBecameDead.emit(entry);
      aliveEntriesChanged = true;
    }

    entry.state = newState;
    this.futureOrPastEntries(newState)?.add(entry);
    this.enqueueEvents(entry, oldState, newState);

    return aliveEntriesChanged;
  }

  private enqueueEvents(entry: LifetimeEntry, oldState: LifetimeEntryState, newState: LifetimeEntryState): void {
    switch (oldState) {
      case LifetimeEntryState.Future:
        this.eventQueue.push([entry, LifetimeBoundaryKind.Start, LifetimeBoundaryCrossingDirection.Forward]);
        if (newState === LifetimeEntryState.Past)
          this.eventQueue.push([entry, LifetimeBoundaryKind.End, LifetimeBoundaryCrossingDirection.Forward]);
        break;

      case LifetimeEntryState.Current:
        this.eventQueue.push(newState === LifetimeEntryState.Past
          ? [entry, LifetimeBoundaryKind.End, LifetimeBoundaryCrossingDirection.Forward]
          : [entry, LifetimeBoundaryKind.Start, LifetimeBoundaryCrossingDirection.Backward]);
        break;

      case LifetimeEntryState.Past:
        this.eventQueue.push([entry, LifetimeBoundaryKind.End, LifetimeBoundaryCrossingDirection.Backward]);
        if (newState === LifetimeEntryState.Future)
          this.eventQueue.push([entry, LifetimeBoundaryKind.Start, LifetimeBoundaryCrossingDirection.Backward]);
        break;
    }
  }
}

/** Retrieves the new state for an entry. */
function getState(entry: LifetimeEntry, startTime: number, endTime: number): LifetimeEntryState {
  // Consider a static entry and a moving time range:
  //                 [-----------Entry-----------]
  // [----Range----] |                           |                      (not alive)
  //   [----Range----]                           |                      (alive)
  //                 |             [----Range----]                      (alive)
  //                 |                           [----Range----]        (not alive)
  //                 |                           | [----Range----]      (not alive)
  //                 |                           |

  if (endTime < entry.lifetimeStart)
    return LifetimeEntryState.Future;

  if (startTime >= entry.lifetimeEnd)
    return LifetimeEntryState.Past;

  return LifetimeEntryState.Current;
}

function removeFrom(list: LifetimeEntry[], entry: LifetimeEntry): boolean {
  const index = list.indexOf(entry);
  if (index < 0) return false;

  list.splice(index, 1);
  return true;
}

function lifetimeStartComparator(x: LifetimeEntry, y: LifetimeEntry): number {
  const c = Math.sign(x.lifetimeStart - y.lifetimeStart);
  return c !== 0 ? c : Math.sign(x.childId - y.childId);
}

function lifetimeEndComparator(x: LifetimeEntry, y: LifetimeEntry): number {
  const c = Math.sign(x.lifetimeEnd - y.lifetimeEnd);
  return c !== 0 ? c : Math.sign(x.childId - y.childId);
}
