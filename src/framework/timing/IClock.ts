// Ported from osu.Framework/Timing/IClock.cs, IFrameBasedClock.cs, IAdjustableClock.cs and FrameTimeInfo.cs

/** A basic clock for keeping time. */
export interface IClock {
  /** The current time of this clock, in milliseconds. */
  readonly currentTime: number;

  /** The rate this clock is running at, relative to real-time. */
  readonly rate: number;

  /** Whether this clock is currently running or not. */
  readonly isRunning: boolean;
}

/** A clock which will only update its current time when a frame process is triggered. Useful for keeping a consistent time state across an individual update. */
export interface IFrameBasedClock extends IClock {
  /** Elapsed time since last frame in milliseconds. */
  readonly elapsedFrameTime: number;

  /** A moving average representation of the frames per second of this clock. Do not use this for any timing purposes (use elapsedFrameTime instead). */
  readonly framesPerSecond: number;

  /** Processes one frame. Generally should be run once per update loop. */
  processFrame(): void;
}

/** An adjustable clock. */
export interface IAdjustableClock extends IClock {
  /** Stop and reset position. */
  reset(): void;

  /** Start (resume) running. */
  start(): void;

  /** Stop (pause) running. */
  stop(): void;

  /** Seek to a specific time position. Returns whether a seek was possible. */
  seek(position: number): boolean;

  rate: number;

  /** Reset the rate to a stable value. */
  resetSpeedAdjustments(): void;
}

export interface FrameTimeInfo {
  /** Elapsed time during last frame in milliseconds. */
  elapsed: number;

  /** Current time in milliseconds. */
  current: number;
}

export function isFrameBasedClock(clock: IClock): clock is IFrameBasedClock {
  return typeof (clock as IFrameBasedClock).processFrame === 'function';
}
