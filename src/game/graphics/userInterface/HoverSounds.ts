// Ported from osu.Game/Graphics/UserInterface/HoverSounds.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Bindable } from '@fw/bindables/Bindable';
import { Axes } from '@fw/layout/Enums';
import { SamplePlaybackHelper } from '../../audio/SamplePlaybackHelper';
import { HoverSampleDebounceComponent } from './HoverSampleDebounceComponent';
import { HoverSampleSet, HoverSampleSetExtensions } from './HoverSampleSet';

/** Adds hover sounds to a drawable. Does not draw anything. */
export class HoverSounds extends HoverSampleDebounceComponent {
  readonly enabled = new Bindable<boolean>(true);

  private sampleHover: Sample | null = null;

  protected readonly sampleSet: HoverSampleSet;

  constructor(sampleSet = HoverSampleSet.Default) {
    super();

    this.sampleSet = sampleSet;
    this.relativeSizeAxes = Axes.Both;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const samples = dependencies.resolve(AudioManager).samples;

    this.sampleHover = await samples.get(`UI/${HoverSampleSetExtensions.getResourceName(this.sampleSet)}-hover`)
      ?? await samples.get(`UI/${HoverSampleSetExtensions.getResourceName(HoverSampleSet.Default)}-hover`);
  }

  override playHoverSample(): void {
    if (!this.enabled.value)
      return;

    SamplePlaybackHelper.playWithRandomPitch(this.sampleHover, 0.02);
  }
}
