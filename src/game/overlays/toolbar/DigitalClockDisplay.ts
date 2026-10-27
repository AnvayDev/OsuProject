// Ported from osu.Game/Overlays/Toolbar/DigitalClockDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { ClockDisplay } from './ClockDisplay';

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/** DateTimeOffset.ToLocalisableString(@"HH:mm:ss" / @"h:mm:ss tt") (the invariant culture's AM/PM designators). */
function formatTime(now: Date, use24HourDisplay: boolean): string {
  const time = `${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

  if (use24HourDisplay)
    return `${pad2(now.getHours())}:${time}`;

  return `${now.getHours() % 12 || 12}:${time} ${now.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** TimeSpan's "c" format ([d.]hh:mm:ss) of a whole number of seconds. */
function formatTimeSpan(totalSeconds: number): string {
  const days = Math.trunc(totalSeconds / 86400);
  const rest = `${pad2(Math.trunc(totalSeconds / 3600) % 24)}:${pad2(Math.trunc(totalSeconds / 60) % 60)}:${pad2(totalSeconds % 60)}`;
  return days > 0 ? `${days}.${rest}` : rest;
}

export class DigitalClockDisplay extends ClockDisplay {
  private realTime!: OsuSpriteText;
  private gameTime!: OsuSpriteText;

  private runningText!: FillFlowContainer;

  private _showRuntime = true;

  get showRuntime(): boolean {
    return this._showRuntime;
  }

  set showRuntime(value: boolean) {
    if (this._showRuntime === value)
      return;

    this._showRuntime = value;
    this.updateMetrics();
  }

  private _use24HourDisplay = false;

  get use24HourDisplay(): boolean {
    return this._use24HourDisplay;
  }

  set use24HourDisplay(value: boolean) {
    if (this._use24HourDisplay === value)
      return;

    this._use24HourDisplay = value;

    this.updateMetrics();
    this.updateDisplay(new Date()); //Update realTime.Text immediately instead of waiting until next second
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.autoSizeAxes = Axes.Both;

    this.internalChildren = [
      this.realTime = new OsuSpriteText().with({
        font: withFont(OsuFont.Default, { fixedWidth: true }),
        spacing: new Vector2(Math.fround(-1.5), 0),
      }),
      this.runningText = new FillFlowContainer().with({
        y: 14,
        colour: colours.pinkLight,
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Horizontal,
        spacing: new Vector2(2, 0),
        children: [
          new OsuSpriteText().with({
            text: 'running',
            font: withFont(OsuFont.Default, { size: 10, weight: FontWeight.SemiBold }),
          }),
          this.gameTime = new OsuSpriteText().with({
            font: withFont(OsuFont.Default, { size: 10, fixedWidth: true, weight: FontWeight.SemiBold }),
            spacing: new Vector2(Math.fround(-0.5), 0),
          }),
        ],
      }),
    ];

    this.updateMetrics();

    return r;
  }

  protected override updateDisplay(now: Date): void {
    this.realTime.text = formatTime(now, this._use24HourDisplay);
    this.gameTime.text = formatTimeSpan(Math.trunc(this.clock!.currentTime / 1000));
  }

  private updateMetrics(): void {
    this.runningText.fadeTo(this._showRuntime ? 1 : 0);
  }
}
