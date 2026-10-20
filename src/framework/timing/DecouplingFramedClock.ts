// Ported from osu.Framework/Timing/DecouplingFramedClock.cs

import { type IAdjustableClock, type IClock, type IFrameBasedClock, isFrameBasedClock, type ISourceChangeableClock } from './IClock';
import { StopwatchClock } from './StopwatchClock';

const isAdjustableClock = (clock: IClock): clock is IAdjustableClock =>
  typeof (clock as Partial<IAdjustableClock>).seek === 'function' && typeof (clock as Partial<IAdjustableClock>).start === 'function';

/**
 * A decoupling clock allows taking an existing clock which has seek limitations and provides a controllable encapsulated view of that clock
 * with the ability to seek and track time outside of the normally seekable bounds.
 *
 * Put simply, it will take a Track which can only track time from 0..trackLength and allow both negative seeking and seeking past trackLength.
 * It will also allow time to continue counting when the source clock is stopped.
 *
 * Note that this is a FramedClock and must be processed each frame.
 */
export class DecouplingFramedClock implements ISourceChangeableClock, IAdjustableClock, IFrameBasedClock {
  /** Whether to allow operation in decoupled mode. Defaults to true. */
  allowDecoupling = true;

  isRunning = false;

  currentTime = 0;

  elapsedFrameTime = 0;

  get framesPerSecond(): number {
    return 0;
  }

  /** Whether the source clock should be running. */
  private shouldBeRunning = false;

  /** The current time, as tracked internally (reported as currentTime after processing the frame). */
  private _currentTime = 0;

  /** The last time value returned by the reference clock. */
  private lastReferenceTime: number | null = null;

  /** Whether the last seek on the source failed. */
  private lastSeekFailed = false;

  private readonly realtimeReferenceClock: IClock = new StopwatchClock(true);

  private adjustableSourceClock!: IAdjustableClock;

  /** Denotes a state where a negative seek stopped the source clock and entered decoupled mode, meaning that after crossing into positive time again we should attempt to start and use the source clock. */
  private pendingSourceRestartAfterNegativeSeek = false;

  source!: IClock;

  constructor(source: IClock | null = null) {
    this.changeSource(source);
  }

  processFrame(): void {
    const lastTime = this.currentTime;

    if (isFrameBasedClock(this.source))
      this.source.processFrame();

    const referenceTime = this.realtimeReferenceClock.currentTime;

    try {
      // If the source is running, there is never a need for any decoupling logic.
      if (this.source.isRunning) {
        this._currentTime = this.source.currentTime;
        this.shouldBeRunning = true;
        return;
      }

      // If we're not allowed to decouple, we should also just pass-through the source time.
      if (!this.allowDecoupling) {
        this._currentTime = this.source.currentTime;
        this.shouldBeRunning = false;
        return;
      }

      // We then want to check whether our internal running state permits time to elapse in decoupled mode.
      if (!this.shouldBeRunning)
        return;

      // We can only begin tracking time from the second frame, as we need an elapsed real time reference.
      if (this.lastReferenceTime === null)
        return;

      const elapsedReferenceTime = (referenceTime - this.lastReferenceTime) * this.rate;

      this._currentTime += elapsedReferenceTime;

      // When crossing into positive time, we should attempt to start and use the source clock.
      // Note that this carries the common assumption that the source clock *should* be able to run from zero.
      if (this.pendingSourceRestartAfterNegativeSeek && this._currentTime >= 0) {
        this.pendingSourceRestartAfterNegativeSeek = false;

        // We still need to check the seek was successful, else we might have already exceeded valid length of the source.
        this.lastSeekFailed = !this.adjustableSourceClock.seek(this._currentTime);
        if (!this.lastSeekFailed)
          this.adjustableSourceClock.start();

        // Don't use the source's time until next frame, as our decoupled time is likely more accurate
        // (starting a clock, especially a TrackBass may have slight discrepancies).
      }
    } finally {
      this.isRunning = this.shouldBeRunning;
      this.lastReferenceTime = referenceTime;
      this.currentTime = this._currentTime;
      this.elapsedFrameTime = this.currentTime - lastTime;
    }
  }

  // #region ISourceChangeableClock implementation

  changeSource(source: IClock | null): void {
    this.source = source ?? new StopwatchClock(true);

    if (!isAdjustableClock(this.source))
      throw new Error('Clock must be of type IAdjustableClock');

    this.adjustableSourceClock = this.source;
    this._currentTime = this.source.currentTime;
    this.shouldBeRunning = this.source.isRunning;
    this.lastSeekFailed = false;
  }

  // #endregion

  // #region IAdjustableClock implementation

  reset(): void {
    this.adjustableSourceClock.reset();
    this.pendingSourceRestartAfterNegativeSeek = false;
    this.shouldBeRunning = false;
    this.lastSeekFailed = false;
    this._currentTime = 0;
  }

  start(): void {
    if (this.shouldBeRunning)
      return;

    // If the previous seek failed, avoid calling `Start` on the source clock.
    // Doing so would potentially cause it to start from an incorrect location (ie. 0 in the case where we are tracking negative time).
    if (this.lastSeekFailed && this.allowDecoupling) {
      this.shouldBeRunning = true;
      return;
    }

    this.adjustableSourceClock.start();
    this.shouldBeRunning = this.adjustableSourceClock.isRunning || this.allowDecoupling;
  }

  stop(): void {
    this.adjustableSourceClock.stop();
    this.shouldBeRunning = false;
  }

  seek(position: number): boolean {
    this.lastSeekFailed = !this.adjustableSourceClock.seek(position);

    if (!this.lastSeekFailed) {
      // Transfer attempt to transfer decoupled running state to source
      // in the case we succeeded.
      if (this.shouldBeRunning && !this.source.isRunning)
        this.adjustableSourceClock.start();
    } else {
      if (!this.allowDecoupling)
        return false;

      // Ensure the underlying clock is stopped as we enter decoupled mode.
      this.adjustableSourceClock.stop();
      this.pendingSourceRestartAfterNegativeSeek = position < 0;
    }

    this._currentTime = position;
    return true;
  }

  resetSpeedAdjustments(): void {
    this.adjustableSourceClock.resetSpeedAdjustments();
  }

  get rate(): number {
    return this.adjustableSourceClock.rate;
  }

  set rate(value: number) {
    this.adjustableSourceClock.rate = value;
  }

  // #endregion
}
