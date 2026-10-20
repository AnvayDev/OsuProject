// Ported from osu.Framework/Timing/IFrameBasedClock.cs (only what transforms need; the full clock port lives alongside)

export interface IFrameBasedClock {
  /** The current time of this clock, in milliseconds. Constant for the duration of a frame. */
  readonly currentTime: number;
}
