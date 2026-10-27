// Ported from osu.Game/Graphics/UserInterface/ProgressBar.cs

import type { Colour4 } from '@fw/graphics/Colour4';
import { Box } from '@fw/graphics/shapes/Box';
import { SliderBar } from '@fw/graphics/userInterface/SliderBar';
import { Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';

export class ProgressBar extends SliderBar {
  private _seeking = false;

  get seeking(): boolean {
    return this._seeking;
  }

  onSeek: ((value: number) => void) | null = null;
  onCommit: ((value: number) => void) | null = null;

  private readonly fill: Box;
  private readonly background: Box;

  set fillColour(value: Colour4) {
    this.fill.fadeColour(value, 150, Easing.OutQuint);
  }

  set backgroundColour(value: Colour4) {
    this.background.alpha = 1;
    this.background.colour = value;
  }

  set endTime(value: number) {
    this.currentNumber.maxValue = value;
  }

  set currentTime(value: number) {
    this.currentNumber.value = value;
  }

  private readonly allowSeek: boolean;

  override get handlePositionalInput(): boolean {
    return this.allowSeek;
  }

  override get handleNonPositionalInput(): boolean {
    return this.allowSeek;
  }

  /** Construct a new progress bar. allowSeek: whether the user should be allowed to click/drag to adjust the value. */
  constructor(allowSeek: boolean) {
    super();

    this.allowSeek = allowSeek;

    this.currentNumber.minValue = 0;
    this.currentNumber.maxValue = 1;
    this.relativeSizeAxes = Axes.X;

    this.children = [
      this.background = new Box().with({
        alpha: 0,
        relativeSizeAxes: Axes.Both,
      }),
      this.fill = new Box().with({ relativeSizeAxes: Axes.Y }),
    ];
  }

  protected override updateValue(value: number): void {
    this.fill.width = value * this.usableWidth;
  }

  protected override onUserChange(value: number): void {
    this._seeking = true;
    this.onSeek?.(value);
    super.onUserChange(value);
  }

  protected override commit(): boolean {
    this._seeking = false;
    this.onCommit?.(this.currentNumber.value);
    return super.commit();
  }
}
