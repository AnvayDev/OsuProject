// Ported from osu.Framework/Graphics/Performance/LifetimeEntry.cs, LifetimeEntryState.cs, LifetimeBoundaryKind.cs and
// LifetimeBoundaryCrossingDirection.cs

import { Signal } from '../../bindables/Signal';

/** The state of a LifetimeEntry. */
export enum LifetimeEntryState {
  /** Not yet loaded. */
  New,
  /** Currently dead and becomes alive in the future: current time < LifetimeStart. */
  Future,
  /** Currently alive. */
  Current,
  /** Currently dead and becomes alive if the clock is rewound: LifetimeEnd <= current time. */
  Past,
}

/** Represents one of the boundaries of the lifetime of a LifetimeEntry. */
export enum LifetimeBoundaryKind {
  /** LifetimeStart. */
  Start,
  /** LifetimeEnd. */
  End,
}

/** Represents a direction of crossing of a lifetime boundary. */
export enum LifetimeBoundaryCrossingDirection {
  /** A crossing from past to future. */
  Forward,
  /** A crossing from future to past. */
  Backward,
}

/** An object for a LifetimeEntryManager to consume, which provides a LifetimeStart and LifetimeEnd. */
export class LifetimeEntry {
  private lifetimeStartBacking = -Number.MAX_VALUE;

  /** The time at which this LifetimeEntry becomes alive in a LifetimeEntryManager. */
  get lifetimeStart(): number {
    return this.lifetimeStartBacking;
  }

  // A method is used as C# doesn't allow the combination of a non-virtual getter and a virtual setter.
  set lifetimeStart(value: number) {
    this.setLifetimeStart(value);
  }

  private lifetimeEndBacking = Number.MAX_VALUE;

  /** The time at which this LifetimeEntry becomes dead in a LifetimeEntryManager. */
  get lifetimeEnd(): number {
    return this.lifetimeEndBacking;
  }

  set lifetimeEnd(value: number) {
    this.setLifetimeEnd(value);
  }

  /** @internal Invoked before LifetimeStart or LifetimeEnd changes. It is used because LifetimeChanged cannot be used to ensure comparator stability. */
  readonly requestLifetimeUpdate = new Signal<LifetimeEntry>();

  /** Invoked after LifetimeStart or LifetimeEnd changes. */
  readonly lifetimeChanged = new Signal<LifetimeEntry>();

  /** Update LifetimeStart of this LifetimeEntry. */
  protected setLifetimeStart(start: number): void {
    if (start !== this.lifetimeStartBacking)
      this.setLifetime(start, this.lifetimeEndBacking);
  }

  /** Update LifetimeEnd of this LifetimeEntry. */
  protected setLifetimeEnd(end: number): void {
    if (end !== this.lifetimeEndBacking)
      this.setLifetime(this.lifetimeStartBacking, end);
  }

  /** Updates the stored lifetimes of this LifetimeEntry. */
  protected setLifetime(start: number, end: number): void {
    this.requestLifetimeUpdate.emit(this);
    this.lifetimeStartBacking = start;
    this.lifetimeEndBacking = Math.max(start, end); // Negative intervals are undesired.
    this.lifetimeChanged.emit(this);
  }

  /** @internal The current state of this LifetimeEntry. */
  state = LifetimeEntryState.New;

  /** @internal Uniquely identifies this LifetimeEntry in a LifetimeEntryManager. */
  childId = 0;
}
