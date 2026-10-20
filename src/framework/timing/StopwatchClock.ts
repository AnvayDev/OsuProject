// Ported from osu.Framework/Timing/StopwatchClock.cs (System.Diagnostics.Stopwatch semantics on performance.now()).

import type { IAdjustableClock } from './IClock';

/** System.Diagnostics.Stopwatch equivalent. */
export class Stopwatch {
  private elapsedBeforeStart = 0;
  private startTimestamp = 0;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  /** Elapsed milliseconds (fractional). */
  get elapsedMilliseconds(): number {
    return this.elapsedBeforeStart + (this.running ? performance.now() - this.startTimestamp : 0);
  }

  start(): void {
    if (this.running) return;

    this.startTimestamp = performance.now();
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;

    this.elapsedBeforeStart += performance.now() - this.startTimestamp;
    this.running = false;
  }

  reset(): void {
    this.elapsedBeforeStart = 0;
    this.running = false;
  }

  restart(): void {
    this.elapsedBeforeStart = 0;
    this.startTimestamp = performance.now();
    this.running = true;
  }
}

export class StopwatchClock extends Stopwatch implements IAdjustableClock {
  private seekOffset = 0;

  /** Keeps track of how much stopwatch time we have used at previous rates. */
  private rateChangeUsed = 0;

  /** Keeps track of the resultant time that was accumulated at previous rates. */
  private rateChangeAccumulated = 0;

  constructor(start = false) {
    super();

    if (start)
      this.start();
  }

  get currentTime(): number {
    return this.stopwatchCurrentTime + this.seekOffset;
  }

  /** The current time, represented solely by the accumulated stopwatch time. */
  private get stopwatchCurrentTime(): number {
    return (this.stopwatchMilliseconds - this.rateChangeUsed) * this._rate + this.rateChangeAccumulated;
  }

  private get stopwatchMilliseconds(): number {
    return this.elapsedMilliseconds;
  }

  private _rate = 1;

  get rate(): number {
    return this._rate;
  }

  set rate(value: number) {
    if (this._rate === value) return;

    this.rateChangeAccumulated += (this.stopwatchMilliseconds - this.rateChangeUsed) * this._rate;
    this.rateChangeUsed = this.stopwatchMilliseconds;

    this._rate = value;
  }

  override reset(): void {
    this.resetAccumulatedRate();
    super.reset();
  }

  override restart(): void {
    this.resetAccumulatedRate();
    super.restart();
  }

  resetSpeedAdjustments(): void {
    this.rate = 1;
  }

  seek(position: number): boolean {
    // Determine the offset that when added to stopwatchCurrentTime; results in the requested time value
    this.seekOffset = position - this.stopwatchCurrentTime;
    return true;
  }

  override toString(): string {
    return `StopwatchClock (${Math.trunc(this.currentTime)}ms)`;
  }

  private resetAccumulatedRate(): void {
    this.rateChangeAccumulated = 0;
    this.rateChangeUsed = 0;
  }
}
