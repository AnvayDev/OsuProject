// Ported from osu.Game/Skinning/PausableSkinnableSound.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { ISamplePlaybackDisabler } from '../audio/ISamplePlaybackDisabler';
import { SkinnableSound } from './SkinnableSound';

export class PausableSkinnableSound extends SkinnableSound {
  /** The length in milliseconds of the longest sample. */
  get length(): number {
    const samples = this.drawableSamples;
    return samples.length === 0 ? 0 : Math.max(...samples.map(sample => sample.length));
  }

  /** Whether playback was requested (and not since stopped), whether or not it is currently suppressed by the playback disabler. */
  requestedPlaying = false;

  private readonly samplePlaybackDisabled = new Bindable<boolean>(false);

  private scheduledStart: ScheduledDelegate | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    // if in a gameplay context, pause sample playback when gameplay is paused.
    const samplePlaybackDisabler = dependencies.get(ISamplePlaybackDisabler);

    if (samplePlaybackDisabler !== null) {
      this.samplePlaybackDisabled.bindTo(samplePlaybackDisabler.samplePlaybackDisabled);
      this.samplePlaybackDisabled.bindValueChanged(e => this.samplePlaybackDisabledChanged(e));
    }

    return r;
  }

  protected samplePlaybackDisabledChanged(disabled: ValueChangedEvent<boolean>): void {
    if (!this.requestedPlaying) return;

    // let non-looping samples that have already been started play out to completion (sounds better than abruptly cutting off).
    if (!this.looping) return;

    this.cancelPendingStart();

    if (disabled.newValue)
      super.stop();
    else {
      // schedule so we don't start playing a sample which is no longer alive.
      this.scheduledStart = this.schedule(() => {
        if (this.requestedPlaying)
          super.play();
      });
    }
  }

  override play(): void {
    this.cancelPendingStart();
    this.requestedPlaying = true;

    if (this.samplePlaybackDisabled.value)
      return;

    super.play();
  }

  override stop(): void {
    this.cancelPendingStart();
    this.requestedPlaying = false;
    super.stop();
  }

  private cancelPendingStart(): void {
    this.scheduledStart?.cancel();
    this.scheduledStart = null;
  }
}
