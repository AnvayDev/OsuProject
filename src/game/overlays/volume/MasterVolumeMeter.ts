// Ported from osu.Game/Overlays/Volume/MasterVolumeMeter.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AdjustableProperty } from '@fw/audio/AudioComponent';
import { AudioManager } from '@fw/audio/AudioManager';
import { Bindable } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import type { Colour4 } from '@fw/graphics/Colour4';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Anchor } from '@fw/layout/Enums';
import { VolumeOverlay } from '../VolumeOverlay';
import { MuteButton } from './MuteButton';
import { VolumeMeter } from './VolumeMeter';

export class MasterVolumeMeter extends VolumeMeter {
  private muteButton!: MuteButton;

  readonly isMuted = new Bindable<boolean>(false);

  private readonly muteAdjustment = new BindableDouble();

  constructor(name: string, circleSize: number, meterColour: Colour4) {
    super(name, circleSize, meterColour);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const audio = dependencies.resolve(AudioManager);
    const volumeOverlay = dependencies.resolve(VolumeOverlay);

    this.isMuted.bindValueChanged(muted => {
      if (muted.newValue)
        audio.addAdjustment(AdjustableProperty.Volume, this.muteAdjustment);
      else
        audio.removeAdjustment(AdjustableProperty.Volume, this.muteAdjustment);
    });

    this.add(this.muteButton = new MuteButton().with({
      anchor: Anchor.CentreLeft,
      origin: Anchor.Centre,
      blending: BlendingParameters.Additive,
      x: this.circleSize / 2,
      y: this.circleSize * Math.fround(0.23),
    }));
    this.muteButton.current.bindTarget = this.isMuted;

    this.muteButton.current.valueChanged.add(() => volumeOverlay.show());
  }

  toggleMute(): void {
    this.muteButton.current.value = !this.muteButton.current.value;
  }
}
