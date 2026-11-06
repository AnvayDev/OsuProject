// Ported from osu.Game/Graphics/UserInterface/OsuSliderBar.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { SliderBar } from '@fw/graphics/userInterface/SliderBar';
import { RNG } from '@fw/utils/RNG';
import { toStandardFormattedString } from '../../extensions/NumberFormattingExtensions';

export abstract class OsuSliderBar extends SliderBar {
  override get acceptsFocus(): boolean {
    return !this.current.disabled;
  }

  playSamplesOnAdjust = true;

  displayAsPercentage = false;

  static readonly MAX_DECIMAL_DIGITS = 5;

  private _tooltipText = '';

  /** (IHasTooltip: { get; protected set; }) */
  get tooltipText(): string {
    return this._tooltipText;
  }

  protected set tooltipText(value: string) {
    this._tooltipText = value;
  }

  private sample: Sample | null = null;

  private lastSampleTime = 0;
  private lastSampleValue = 0;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    void dependencies.resolve(AudioManager).samples.get('UI/notch-tick').then(s => this.sample = s);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.currentNumber.bindValueChanged(current => this.tooltipText = this.getTooltipText(current.newValue), true);
  }

  protected override onUserChange(value: number): void {
    super.onUserChange(value);

    this.playSample(value);

    this.tooltipText = this.getTooltipText(value);
  }

  private playSample(value: number): void {
    if (!this.playSamplesOnAdjust)
      return;

    if (this.clock!.currentTime - this.lastSampleTime <= 30)
      return;

    if (value === this.lastSampleValue)
      return;

    this.lastSampleValue = value;
    this.lastSampleTime = this.clock!.currentTime;

    const channel = this.sample?.getChannel();
    if (channel === undefined)
      return;

    channel.frequency.value = 0.99 + RNG.nextDouble(0.02) + this.normalizedValue * 0.2;

    // intentionally pitched down, even when hitting max.
    if (this.normalizedValue === 0 || this.normalizedValue === 1)
      channel.frequency.value -= 0.5;

    channel.play();
  }

  protected getTooltipText(value: number): string {
    return toStandardFormattedString(value, OsuSliderBar.MAX_DECIMAL_DIGITS, this.displayAsPercentage);
  }
}
