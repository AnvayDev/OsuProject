// Ported from osu.Game/Rulesets/Mods/RateAdjustModHelper.cs

import { AdjustableProperty, type IAdjustableAudioComponent } from '@fw/audio/AudioComponent';
import type { BindableBool } from '@fw/bindables/Bindable';
import type { BindableNumber } from '@fw/bindables/BindableNumber';

export class RateAdjustModHelper {
  private track: IAdjustableAudioComponent | null = null;

  private adjustPitch: BindableBool | null = null;

  constructor(readonly speedChange: BindableNumber) {}

  handleAudioAdjustments(adjustPitch: BindableBool): void {
    this.adjustPitch = adjustPitch;

    const adjustmentForPitchSetting = (adjustPitchSettingValue: boolean) =>
      adjustPitchSettingValue ? AdjustableProperty.Frequency : AdjustableProperty.Tempo;

    // When switching between pitch adjust, we need to update adjustments to time-shift or frequency-scale.
    adjustPitch.bindValueChanged(adjustPitchSetting => {
      this.track?.removeAdjustment(adjustmentForPitchSetting(adjustPitchSetting.oldValue), this.speedChange);
      this.track?.addAdjustment(adjustmentForPitchSetting(adjustPitchSetting.newValue), this.speedChange);
    });
  }

  applyToTrack(track: IAdjustableAudioComponent): void {
    if (this.adjustPitch === null)
      throw new Error('Must call handleAudioAdjustments first');

    this.track = track;
    this.adjustPitch.triggerChange();
  }
}
