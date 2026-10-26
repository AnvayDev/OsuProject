// Ported from osu.Game/Overlays/Toolbar/ClockDisplay.cs

import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';

export abstract class ClockDisplay extends CompositeDrawable {
  private lastSecond: number | null = null;

  protected override loadComplete(): void {
    super.loadComplete();

    this.updateDisplay(new Date());
    this.finishTransforms(true);
  }

  protected override update(): void {
    super.update();

    const now = new Date();

    if (now.getSeconds() !== this.lastSecond) {
      this.lastSecond = now.getSeconds();
      this.updateDisplay(now);
    }
  }

  protected abstract updateDisplay(now: Date): void;
}
