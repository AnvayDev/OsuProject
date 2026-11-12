// Ported from osu.Game/Skinning/PoolableSkinnableSample.cs and IPooledSampleProvider.cs

import { AdjustableProperty, type IAdjustableAudioComponent, type IAggregateAudioAdjustment } from '@fw/audio/AudioComponent';
import type { SampleChannel } from '@fw/audio/sample/SampleChannel';
import type { Bindable } from '@fw/bindables/Bindable';
import type { BindableDouble } from '@fw/bindables/BindableNumber';
import { DrawableSample } from '@fw/graphics/audio/DrawableSample';
import { AudioContainer } from '@fw/graphics/containers/AudioContainer';
import { Axes, LoadState } from '@fw/layout/Enums';
import type { ISampleInfo } from '../audio/SampleInfo';
import type { ISkinSource } from './ISkin';
import { SkinReloadableDrawable } from './SkinReloadableDrawable';

/**
 * Provides pooled samples to be used by SkinnableSounds.
 * A DI key (C# resolves the interface): implementations cache themselves with `cacheAs(IPooledSampleProvider, this)` and carry the marker.
 */
export abstract class IPooledSampleProvider {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as { isPooledSampleProvider?: unknown } | null)?.isPooledSampleProvider === true;
  }

  abstract readonly isPooledSampleProvider: true;

  /** Retrieves a PoolableSkinnableSample from a pool, or null if it could not be retrieved. */
  abstract getPooledSample(sampleInfo: ISampleInfo): PoolableSkinnableSample | null;
}

/** A sample corresponding to an ISampleInfo that supports being pooled and responding to skin changes. */
export class PoolableSkinnableSample extends SkinReloadableDrawable implements IAdjustableAudioComponent {
  /** The currently-loaded DrawableSample. */
  sample: DrawableSample | null = null;

  private readonly sampleContainer: AudioContainer<DrawableSample>;

  private sampleInfo: ISampleInfo | null = null;
  private activeChannel: SampleChannel | null = null;

  /** Creates a new PoolableSkinnableSample, optionally with an applied ISampleInfo. */
  constructor(sampleInfo: ISampleInfo | null = null) {
    super();

    this.internalChild = this.sampleContainer = new AudioContainer<DrawableSample>().with({ relativeSizeAxes: Axes.Both });

    if (sampleInfo !== null)
      this.apply(sampleInfo);
  }

  /** Applies an ISampleInfo that describes the sample to retrieve. Only one ISampleInfo can ever be applied to a PoolableSkinnableSample. */
  apply(sampleInfo: ISampleInfo): void {
    if (this.sampleInfo !== null)
      throw new Error('A PoolableSkinnableSample cannot be applied multiple ISampleInfos.');

    this.sampleInfo = sampleInfo;

    this.volume.value = sampleInfo.volume / 100.0;

    if (this.loadState >= LoadState.Ready)
      this.updateSample();
  }

  protected override skinChanged(skin: ISkinSource): void {
    super.skinChanged(skin);
    this.updateSample();
  }

  /** Whether this sample was playing before a skin source change. */
  private wasPlaying = false;

  private clearPreviousSamples(): void {
    // only run if the samples aren't already cleared.
    // this ensures the "wasPlaying" state is stored correctly even if multiple clear calls are executed.
    if (this.sampleContainer.count === 0) return;

    this.wasPlaying = this.playing;

    this.sampleContainer.clear();
    this.sample = null;
  }

  private updateSample(): void {
    this.clearPreviousSamples();

    if (this.sampleInfo === null)
      return;

    const sample = this.currentSkin.getSample(this.sampleInfo);

    if (sample === null)
      return;

    this.sampleContainer.add(this.sample = new DrawableSample(sample));

    // Start playback internally for the new sample if the previous one was playing beforehand.
    if (this.wasPlaying && this.looping)
      this.play();
  }

  /** Plays the sample. */
  play(): void {
    this.flushPendingSkinChanges();

    if (this.sample === null)
      return;

    this.activeChannel = this.sample.getChannel();
    this.activeChannel.looping = this.looping;
    this.activeChannel.play();

    this.played = true;
  }

  /** Stops the sample. */
  stop(): void {
    this.activeChannel?.stop();
    this.activeChannel = null;
  }

  /** Whether the sample is currently playing. */
  get playing(): boolean {
    return this.activeChannel?.playing ?? false;
  }

  played = false;

  private loopingBacking = false;

  /** Whether the sample should loop on completion. */
  get looping(): boolean {
    return this.loopingBacking;
  }

  set looping(value: boolean) {
    this.loopingBacking = value;

    if (this.activeChannel !== null)
      this.activeChannel.looping = value;
  }

  // #region Re-expose AudioContainer

  get volume(): BindableDouble { return this.sampleContainer.volume; }
  get balance(): BindableDouble { return this.sampleContainer.balance; }
  get frequency(): BindableDouble { return this.sampleContainer.frequency; }
  get tempo(): BindableDouble { return this.sampleContainer.tempo; }

  bindAdjustments(component: IAggregateAudioAdjustment): void { this.sampleContainer.bindAdjustments(component); }
  unbindAdjustments(component: IAggregateAudioAdjustment): void { this.sampleContainer.unbindAdjustments(component); }
  addAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void { this.sampleContainer.addAdjustment(type, adjustBindable); }
  removeAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void { this.sampleContainer.removeAdjustment(type, adjustBindable); }
  removeAllAdjustments(type: AdjustableProperty): void { this.sampleContainer.removeAllAdjustments(type); }

  get aggregateVolume(): Bindable<number> { return this.sampleContainer.aggregateVolume; }
  get aggregateBalance(): Bindable<number> { return this.sampleContainer.aggregateBalance; }
  get aggregateFrequency(): Bindable<number> { return this.sampleContainer.aggregateFrequency; }
  get aggregateTempo(): Bindable<number> { return this.sampleContainer.aggregateTempo; }

  // #endregion
}
