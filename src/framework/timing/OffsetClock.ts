// Ported from osu.Framework/Timing/OffsetClock.cs and FramedOffsetClock.cs

import { FramedClock } from './FramedClock';
import type { IClock } from './IClock';

/** A clock with an offset applied to the source's time. */
export class OffsetClock implements IClock {
  offset = 0;

  constructor(protected source: IClock) {}

  get currentTime(): number {
    return this.source.currentTime + this.offset;
  }

  get rate(): number {
    return this.source.rate;
  }

  get isRunning(): boolean {
    return this.source.isRunning;
  }
}

/** A FramedClock with an offset applied to its time (changing the offset does not count as elapsed time). */
export class FramedOffsetClock extends FramedClock {
  override get currentTime(): number {
    return super.currentTime + this._offset;
  }

  override set currentTime(value: number) {
    super.currentTime = value;
  }

  private _offset = 0;

  get offset(): number {
    return this._offset;
  }

  set offset(value: number) {
    this.lastFrameTime += value - this._offset;
    this._offset = value;
  }

  constructor(source: IClock | null, processSource = true) {
    super(source, processSource);
  }
}
