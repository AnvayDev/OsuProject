// Ported from osu.Framework/Timing/FramedClock.cs and ManualClock.cs

import { isFrameBasedClock, type IClock, type IFrameBasedClock } from './IClock';
import { StopwatchClock } from './StopwatchClock';

/** Takes a clock source and separates time reading on a per-frame level. The CurrentTime value will only change on initial construction and whenever ProcessFrame is run. */
export class FramedClock implements IFrameBasedClock {
  source!: IClock;

  /** processSource: whether the source clock should have ProcessFrame called on it automatically. */
  constructor(source: IClock | null = null, private readonly processSource = true) {
    this.changeSource(source ?? new StopwatchClock(true));
  }

  private readonly betweenFrameTimes = new Array<number>(128).fill(0);

  private totalFramesProcessed = 0;

  framesPerSecond = 0;

  jitter = 0;

  currentTime = 0;

  protected lastFrameTime = 0;

  get rate(): number {
    return this.source.rate;
  }

  protected get sourceTime(): number {
    return this.source.currentTime;
  }

  get elapsedFrameTime(): number {
    return this.currentTime - this.lastFrameTime;
  }

  get isRunning(): boolean {
    return this.source.isRunning;
  }

  private timeUntilNextCalculation = 0;
  private timeSinceLastCalculation = 0;
  private framesSinceLastCalculation = 0;

  private static readonly fps_calculation_interval = 250;

  changeSource(source: IClock): void {
    this.source = source;
    this.currentTime = this.lastFrameTime = source.currentTime;
  }

  processFrame(): void {
    this.betweenFrameTimes[this.totalFramesProcessed % this.betweenFrameTimes.length] = this.currentTime - this.lastFrameTime;
    this.totalFramesProcessed++;

    if (this.processSource && isFrameBasedClock(this.source))
      this.source.processFrame();

    if (this.timeUntilNextCalculation <= 0) {
      this.timeUntilNextCalculation += FramedClock.fps_calculation_interval;

      if (this.framesSinceLastCalculation === 0) {
        this.framesPerSecond = 0;
        this.jitter = 0;
      } else {
        this.framesPerSecond = Math.ceil(this.framesSinceLastCalculation * 1000 / this.timeSinceLastCalculation);

        // simple stddev
        let sum = 0;
        let sumOfSquares = 0;

        for (const v of this.betweenFrameTimes) {
          sum += v;
          sumOfSquares += v * v;
        }

        const avg = sum / this.betweenFrameTimes.length;
        const variance = (sumOfSquares / this.betweenFrameTimes.length) - (avg * avg);
        this.jitter = Math.sqrt(variance);
      }

      this.timeSinceLastCalculation = this.framesSinceLastCalculation = 0;
    }

    this.framesSinceLastCalculation++;
    this.timeUntilNextCalculation -= this.elapsedFrameTime;
    this.timeSinceLastCalculation += this.elapsedFrameTime;

    this.lastFrameTime = this.currentTime;
    this.currentTime = this.sourceTime;
  }

  toString(): string {
    return `FramedClock (${Math.trunc(this.currentTime)}ms, ${this.framesPerSecond} FPS)`;
  }
}

/** A completely manual clock implementation. Everything is settable. */
export class ManualClock implements IClock {
  currentTime = 0;
  rate = 0;
  isRunning = false;
}
