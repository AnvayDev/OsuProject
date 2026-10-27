// Ported from osu.Game/Graphics/UserInterface/ShearedToggleButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { BindableBool } from '@fw/bindables/Bindable';
import type { HoverSampleSet } from './HoverSampleSet';
import { HoverSounds } from './HoverSounds';
import { ShearedButton } from './ShearedButton';

export class ShearedToggleButton extends ShearedButton {
  private sampleOff: Sample | null = null;
  private sampleOn: Sample | null = null;

  /**
   * Sheared toggle buttons by default play two samples when toggled: a click and a toggle (on/off).
   * Sometimes this might be too much. Setting this to false will silence the toggle sound.
   */
  protected get playToggleSamples(): boolean {
    return true;
  }

  /** Whether this button is currently toggled to an active state. */
  readonly active = new BindableBool();

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const audio = dependencies.resolve(AudioManager);
    void audio.samples.get('UI/check-on').then(s => this.sampleOn = s);
    void audio.samples.get('UI/check-off').then(s => this.sampleOff = s);

    return r;
  }

  protected override createHoverSounds(sampleSet: HoverSampleSet): HoverSounds {
    return new HoverSounds(sampleSet);
  }

  protected override loadComplete(): void {
    this.active.bindDisabledChanged(disabled => this.action = disabled ? null : () => this.active.toggle(), true);
    this.active.bindValueChanged(() => {
      this.updateActiveState();
      this.playSample();
    });

    this.updateActiveState();
    super.loadComplete();
  }

  protected updateActiveState(): void {
    this.darkerColour = this.active.value ? this.colourProvider.highlight1 : this.colourProvider.background3;
    this.lighterColour = this.active.value ? this.colourProvider.colour0 : this.colourProvider.background1;
    this.textColour = this.active.value ? this.colourProvider.background6 : this.colourProvider.content1;
  }

  private playSample(): void {
    if (this.playToggleSamples) {
      if (this.active.value)
        this.sampleOn?.play();
      else
        this.sampleOff?.play();
    }
  }
}
