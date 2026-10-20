// Ported from osu.Game/Beatmaps/Timing/BreakPeriod.cs

const BREAK_FADE_DURATION = 325; // BreakOverlay.BREAK_FADE_DURATION

export class BreakPeriod {
  /** The minimum gap between the start of the break and the previous object. */
  static readonly GAP_BEFORE_BREAK = 200;

  /** The minimum gap between the end of the break and the next object. Based on osu! preempt time at AR=10. See also: https://github.com/ppy/osu/issues/14330#issuecomment-1002158551 */
  static readonly GAP_AFTER_BREAK = 450;

  /** The minimum duration required for a break to have any effect. */
  static readonly MIN_BREAK_DURATION = 650;

  /** The minimum required duration of a gap between two objects such that a break can be placed between them. */
  static readonly MIN_GAP_DURATION = BreakPeriod.GAP_BEFORE_BREAK + BreakPeriod.MIN_BREAK_DURATION + BreakPeriod.GAP_AFTER_BREAK;

  constructor(readonly startTime: number, readonly endTime: number) {}

  /** The break duration. */
  get duration(): number {
    return this.endTime - this.startTime;
  }

  /** Whether the break has any effect. */
  get hasEffect(): boolean {
    return this.duration >= BreakPeriod.MIN_BREAK_DURATION;
  }

  /** Whether this break contains a specified time. */
  contains(time: number): boolean {
    return time >= this.startTime && time <= this.endTime - BREAK_FADE_DURATION;
  }

  intersects(other: BreakPeriod): boolean {
    return this.startTime <= other.endTime && this.endTime >= other.startTime;
  }

  equals(other: BreakPeriod | null): boolean {
    return other !== null && this.startTime === other.startTime && this.endTime === other.endTime;
  }

  compareTo(other: BreakPeriod | null): number {
    if (this === other) return 0;
    if (other === null) return 1;

    const result = Math.sign(this.startTime - other.startTime);
    if (result !== 0)
      return result;

    return Math.sign(this.endTime - other.endTime);
  }
}
