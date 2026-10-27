// Ported from osu.Game/Screens/Play/OffsetCorrectionClock.cs
// C# hides FramedOffsetClock.Offset with `new`; here the accessor is overridden and the base offset is reached through `super.offset`.

import type { IClock } from '@fw/timing/IClock';
import { FramedOffsetClock } from '@fw/timing/OffsetClock';

export class OffsetCorrectionClock extends FramedOffsetClock {
  private offsetValue = 0;

  override get offset(): number {
    return this.offsetValue;
  }

  override set offset(value: number) {
    if (value === this.offsetValue)
      return;

    this.offsetValue = value;

    this.updateOffset();
  }

  get rateAdjustedOffset(): number {
    return super.offset;
  }

  constructor(source: IClock) {
    super(source);
  }

  override processFrame(): void {
    super.processFrame();
    this.updateOffset();
  }

  private updateOffset(): void {
    // we always want to apply the same real-time offset, so it should be adjusted by the difference in playback rate (from realtime) to achieve this.
    super.offset = this.offset * this.rate;
  }
}
