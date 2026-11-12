// Ported from osu.Game/Utils/PeriodTracker.cs

export class Period {
  /** The start time of this period, and its end time (both inclusive). */
  constructor(readonly start: number, readonly end: number) {
    // (written as in C#: a NaN bound is accepted.)
    if (start >= end)
      throw new Error('Invalid period provided, start must be less than end');
  }

  get duration(): number {
    return this.end - this.start;
  }
}

/** Represents a tracking component used for whether a specific time instant falls into any of the provided periods. */
export class PeriodTracker {
  private readonly periods: Period[];
  private nearestIndex = 0;

  constructor(periods: Iterable<Period>) {
    this.periods = [...periods].sort((a, b) => a.start - b.start);
  }

  /** Whether the provided time is in any of the added periods (and which). */
  isInAny(time: number): Period | null {
    const periods = this.periods;

    if (periods.length === 0)
      return null;

    if (time > periods[this.nearestIndex].end) {
      while (time > periods[this.nearestIndex].end && this.nearestIndex < periods.length - 1)
        this.nearestIndex++;
    } else {
      while (time < periods[this.nearestIndex].start && this.nearestIndex > 0)
        this.nearestIndex--;
    }

    const nearest = periods[this.nearestIndex];
    return time >= nearest.start && time <= nearest.end ? nearest : null;
  }
}
