// Ported from osu.Game/Graphics/UserInterface/HoverClickSounds.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import type { ClickEvent } from '@fw/input/events/UIEvents';
import { MouseButton } from '@fw/input/Key';
import { SamplePlaybackHelper } from '../../audio/SamplePlaybackHelper';
import { HoverSampleSet, HoverSampleSetExtensions } from './HoverSampleSet';
import { HoverSounds } from './HoverSounds';

/** Adds hover and click sounds to a drawable. Does not draw anything. */
export class HoverClickSounds extends HoverSounds {
  private sampleClick: Sample | null = null;
  private sampleClickDisabled: Sample | null = null;

  private readonly buttons: MouseButton[];

  /**
   * A container which plays sounds on hover and click for any specified MouseButtons.
   * @param sampleSet Set of click samples to play.
   * @param buttons Array of button codes which should trigger the click sound. If omitted or null, the click sound will only be played on left click.
   */
  constructor(sampleSet = HoverSampleSet.Default, buttons: MouseButton[] | null = null) {
    super(sampleSet);

    this.buttons = buttons ?? [MouseButton.Left];
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const samples = dependencies.resolve(AudioManager).samples;
    const name = HoverSampleSetExtensions.getResourceName(this.sampleSet);
    const defaultName = HoverSampleSetExtensions.getResourceName(HoverSampleSet.Default);

    this.sampleClick = await samples.get(`UI/${name}-select`) ?? await samples.get(`UI/${defaultName}-select`);
    this.sampleClickDisabled = await samples.get(`UI/${name}-select-disabled`) ?? await samples.get(`UI/${defaultName}-select-disabled`);
  }

  protected override onClick(e: ClickEvent): boolean {
    if (this.buttons.includes(e.button))
      this.playClickSample();

    return super.onClick(e);
  }

  playClickSample(): void {
    SamplePlaybackHelper.playWithRandomPitch(this.enabled.value ? this.sampleClick : this.sampleClickDisabled, 0.01);
  }
}
