// Ported from osu.Game/Graphics/DrawableDate.cs
// Tooltips aren't ported yet (the DateTooltip).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { LoadState } from '@fw/layout/Enums';
import { humanize } from '../utils/HumanizerUtils';
import { FontWeight, OsuFont } from './OsuFont';
import { OsuSpriteText } from './sprites/OsuSpriteText';

export class DrawableDate extends OsuSpriteText {
  private _date = new Date(0);

  get date(): Date {
    return this._date;
  }

  set date(value: Date) {
    if (this._date.getTime() === value.getTime())
      return;

    this._date = value;

    if (this.loadState >= LoadState.Ready)
      this.updateTime();
  }

  constructor(date: Date, textSize = OsuFont.DEFAULT_FONT_SIZE, italic = true) {
    super();

    this.font = OsuFont.getFont({ weight: FontWeight.Regular, size: textSize, italics: italic });
    this.date = date;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.updateTime();
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.scheduler.add(this.updateTimeWithReschedule);
  }

  private readonly updateTimeWithReschedule = (): void => {
    this.updateTime();

    const diffToNow = Date.now() - this.date.getTime();

    let timeUntilNextUpdate = 1000;

    if (Math.abs(diffToNow / 1000) > 120) {
      timeUntilNextUpdate *= 60;

      if (Math.abs(diffToNow / 60_000) > 120) {
        timeUntilNextUpdate *= 60;

        if (Math.abs(diffToNow / 3_600_000) > 48)
          timeUntilNextUpdate *= 24;
      }
    }

    this.scheduler.addDelayed(this.updateTimeWithReschedule, timeUntilNextUpdate);
  };

  protected format(): string {
    return humanize(this.date);
  }

  private updateTime(): void {
    this.text = this.format();
  }
}
