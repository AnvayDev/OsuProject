// Ported from osu.Game/Graphics/UserInterface/OsuMenuSamples.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Component } from '@fw/graphics/Component';

export class OsuMenuSamples extends Component {
  private sampleClick: Sample | null = null;
  private sampleOpen: Sample | null = null;
  private sampleSubOpen: Sample | null = null;
  private sampleClose: Sample | null = null;

  private triggerOpen = false;
  private triggerSubOpen = false;
  private triggerClose = false;

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const audio = dependencies.resolve(AudioManager);

    this.sampleClick = await audio.samples.get('UI/menu-open-select');
    this.sampleOpen = await audio.samples.get('UI/menu-open');
    this.sampleSubOpen = await audio.samples.get('UI/menu-sub-open');
    this.sampleClose = await audio.samples.get('UI/menu-close');
  }

  playClickSample(): void {
    this.scheduler.addOnce(this.playClickSampleInternal);
  }

  playOpenSample(): void {
    this.triggerOpen = true;
    this.scheduler.addOnce(this.resolvePlayback);
  }

  playSubOpenSample(): void {
    this.triggerSubOpen = true;
    this.scheduler.addOnce(this.resolvePlayback);
  }

  playCloseSample(): void {
    this.triggerClose = true;
    this.scheduler.addOnce(this.resolvePlayback);
  }

  private readonly playClickSampleInternal = (): void => {
    this.sampleClick?.play();
  };

  private readonly resolvePlayback = (): void => {
    if (this.triggerSubOpen)
      this.sampleSubOpen?.play();
    else if (this.triggerOpen)
      this.sampleOpen?.play();
    else if (this.triggerClose)
      this.sampleClose?.play();

    this.triggerOpen = this.triggerSubOpen = this.triggerClose = false;
  };
}
