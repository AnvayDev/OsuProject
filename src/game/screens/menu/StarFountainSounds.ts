// Ported from osu.Game/Screens/Menu/StarFountainSounds.cs
// The SkinnableSound / PausableSkinnableSound wrappers are not ported (there is no skinning): the default (Argon) skin's samples are used
// directly, and the loop sample's PausableSkinnableSound behaviour is inlined below.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import { AdjustableProperty } from '@fw/audio/AudioComponent';
import type { Sample } from '@fw/audio/sample/Sample';
import type { SampleChannel } from '@fw/audio/sample/SampleChannel';
import { BindableBool } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { ISamplePlaybackDisabler } from '../../audio/ISamplePlaybackDisabler';

const shoot_retrigger_delay = 500;
const loop_fade_duration = 500;

export class StarFountainSounds extends CompositeDrawable {
  private lastPlayback: number | null = null;

  private shootSample: Sample | null = null;
  private loopSample: Sample | null = null;

  private loopFadeDelegate: ScheduledDelegate | null = null;
  private loopStopDelegate: ScheduledDelegate | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    // (SampleInfo("Gameplay/fountain-shoot") / ("Gameplay/fountain-loop"), as the default Argon skin resolves them)
    const samples = dependencies.resolve(AudioManager).samples;
    void samples.get('Gameplay/Argon/fountain-shoot').then(s => this.shootSample = s);
    void samples.get('Gameplay/Argon/fountain-loop').then(s => this.loopSample = s);

    // PausableSkinnableSound.load
    const disabler = dependencies.get(ISamplePlaybackDisabler);

    if (disabler !== null) {
      this.samplePlaybackDisabled.bindTo(disabler.samplePlaybackDisabled);
      this.samplePlaybackDisabled.bindValueChanged(e => this.samplePlaybackDisabledChanged(e.newValue));
    }

    return r;
  }

  play(): void {
    this.loopFadeDelegate?.cancel();
    this.loopStopDelegate?.cancel();

    try {
      // Only play 'shootSample' if enough time has passed since last `Play()` call.
      if (this.lastPlayback === null || this.time.current - this.lastPlayback > shoot_retrigger_delay) {
        this.stopLoop();
        this.shootSample?.play();
        return;
      }

      // Only call `Play()` if `loopSample` is not already playing, to prevent restarting the sample each time.
      if (!this.loopRequestedPlaying) {
        this.transformBindableTo(this.loopVolume, 1);
        this.playLoop();
      }

      // Schedule a volume fadeout, followed by a `Stop()`.
      this.loopFadeDelegate = this.scheduler.addDelayed(() => {
        this.transformBindableTo(this.loopVolume, 0, loop_fade_duration);
        this.loopStopDelegate = this.scheduler.addDelayed(() => this.stopLoop(), loop_fade_duration);
      }, shoot_retrigger_delay);
    } finally {
      this.lastPlayback = this.time.current;
    }
  }

  // #region the loop sample (PausableSkinnableSound { Looping = true })

  private readonly samplePlaybackDisabled = new BindableBool();
  private readonly loopVolume = new BindableDouble(1).with({ minValue: 0, maxValue: 1 });
  private loopChannel: SampleChannel | null = null;
  private loopRequestedPlaying = false;
  private scheduledStart: ScheduledDelegate | null = null;

  private samplePlaybackDisabledChanged(disabled: boolean): void {
    if (!this.loopRequestedPlaying) return;

    this.cancelPendingStart();

    if (disabled)
      this.stopLoopChannel();
    else {
      // schedule so we don't start playing a sample which is no longer alive.
      this.scheduledStart = this.schedule(() => {
        if (this.loopRequestedPlaying)
          this.startLoopChannel();
      });
    }
  }

  private playLoop(): void {
    this.cancelPendingStart();
    this.loopRequestedPlaying = true;

    if (this.samplePlaybackDisabled.value)
      return;

    this.startLoopChannel();
  }

  private stopLoop(): void {
    this.cancelPendingStart();
    this.loopRequestedPlaying = false;
    this.stopLoopChannel();
  }

  private cancelPendingStart(): void {
    this.scheduledStart?.cancel();
    this.scheduledStart = null;
  }

  /** PoolableSkinnableSample.Play: a new channel each time. */
  private startLoopChannel(): void {
    this.stopLoopChannel();

    if (this.loopSample === null)
      return;

    const channel = this.loopChannel = this.loopSample.getChannel();
    channel.looping = true;
    channel.addAdjustment(AdjustableProperty.Volume, this.loopVolume);
    channel.play();
  }

  private stopLoopChannel(): void {
    this.loopChannel?.stop();
    this.loopChannel = null;
  }

  // #endregion

  protected override disposeInternal(isDisposing: boolean): void {
    this.stopLoopChannel();
    super.disposeInternal(isDisposing);
  }
}
