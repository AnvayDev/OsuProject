// Ported from osu.Framework/Timing/InterpolatingFramedClock.cs

import { dampContinuously } from '../transforms/Interpolation';
import { FramedClock } from './FramedClock';
import { type IClock, type IFrameBasedClock, isFrameBasedClock, type ISourceChangeableClock } from './IClock';
import { StopwatchClock } from './StopwatchClock';

/**
 * A clock which uses an internal stopwatch to interpolate (smooth out) a source.
 * Note that this will NOT seek the source clock. Please use DecouplingFramedClock for that.
 */
export class InterpolatingFramedClock implements IFrameBasedClock, ISourceChangeableClock {
  /** The amount of error that is allowed between the source and interpolated time before the interpolated time is ignored and the source time is used. */
  allowableErrorMilliseconds = 1000.0 / 60 * 2;

  /** Drift recovery half-life in milliseconds. */
  driftRecoveryHalfLife = 50;

  /** Whether interpolation was applied at the last processed frame. */
  isInterpolating = false;

  get drift(): number {
    return this.currentTime - this.framedSourceClock.currentTime;
  }

  get rate(): number {
    return this.framedSourceClock.rate;
  }

  isRunning = false;

  elapsedFrameTime = 0;

  source!: IClock;

  private framedSourceClock!: IFrameBasedClock;

  currentTime = 0;

  private readonly realtimeClock = new FramedClock(new StopwatchClock(true));

  private _currentTime = 0;

  constructor(source: IFrameBasedClock | null = null) {
    this.changeSource(source);
  }

  changeSource(source: IClock | null): void {
    if (source !== null && source === this.source)
      return;

    this.source = source ?? new StopwatchClock(true);

    // We need a frame-based source to correctly process interpolation.
    // If the provided source is not already a framed clock, encapsulate it in one.
    this.framedSourceClock = isFrameBasedClock(this.source) ? this.source : new FramedClock(source);

    this.isInterpolating = false;
    this._currentTime = this.framedSourceClock.currentTime;
  }

  processFrame(): void {
    const lastTime = this._currentTime;

    this.realtimeClock.processFrame();
    this.framedSourceClock.processFrame();

    const sourceIsRunning = this.framedSourceClock.isRunning;

    const sourceHasElapsed = this.framedSourceClock.elapsedFrameTime !== 0;

    try {
      if (!sourceIsRunning) {
        // While the source isn't running, we remain in the current interpolation mode unless there's a seek.
        // This is to ensure the most consistent playback possible, and avoid fractional differences when stopping/starting the source.
        if (sourceHasElapsed) {
          this.isInterpolating = false;
          this._currentTime = this.framedSourceClock.currentTime;
        }

        return;
      }

      if (this.isInterpolating) {
        // Apply time increase from interpolation.
        this._currentTime += this.realtimeClock.elapsedFrameTime * this.rate;

        // Then check the post-interpolated time.
        // If we differ from the current time of the source, gradually approach the ground truth.
        //
        // The remaining error halves every half-life ms.
        this._currentTime = dampContinuously(this._currentTime, this.framedSourceClock.currentTime, this.driftRecoveryHalfLife, this.realtimeClock.elapsedFrameTime);

        const withinAllowableError = Math.abs(this.framedSourceClock.currentTime - this._currentTime) <= this.allowableErrorMilliseconds * this.rate;

        if (!withinAllowableError) {
          // if we've exceeded the allowable error, we should use the source clock's time value.
          this.isInterpolating = false;
          this._currentTime = this.framedSourceClock.currentTime;
        }
      } else {
        this._currentTime = this.framedSourceClock.currentTime;

        // Of importance, only start interpolating from the next frame.
        // The first frame after a clock starts may give very incorrect results, ie. due to a seek in the frame before.
        if (sourceHasElapsed)
          this.isInterpolating = true;
      }

      // seeking backwards should only be allowed if the source is explicitly doing that.
      const elapsedInOpposingDirection = this.framedSourceClock.elapsedFrameTime !== 0 && Math.sign(this.framedSourceClock.elapsedFrameTime) !== Math.sign(this.rate);
      if (!elapsedInOpposingDirection)
        this._currentTime = this.rate >= 0 ? Math.max(lastTime, this._currentTime) : Math.min(lastTime, this._currentTime);
    } finally {
      this.isRunning = sourceIsRunning;
      this.currentTime = this._currentTime;
      this.elapsedFrameTime = this._currentTime - lastTime;
    }
  }

  get framesPerSecond(): number {
    return 0;
  }
}
