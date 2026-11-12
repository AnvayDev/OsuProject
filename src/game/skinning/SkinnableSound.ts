// Ported from osu.Game/Skinning/SkinnableSound.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AdjustableProperty, type IAdjustableAudioComponent, type IAggregateAudioAdjustment } from '@fw/audio/AudioComponent';
import type { Bindable } from '@fw/bindables/Bindable';
import type { BindableDouble } from '@fw/bindables/BindableNumber';
import type { DrawableSample } from '@fw/graphics/audio/DrawableSample';
import { AudioContainer } from '@fw/graphics/containers/AudioContainer';
import { LoadState } from '@fw/layout/Enums';
import type { ISampleInfo } from '../audio/SampleInfo';
import { IPooledSampleProvider, PoolableSkinnableSample } from './PoolableSkinnableSample';
import { SkinReloadableDrawable } from './SkinReloadableDrawable';

/** A sound consisting of one or more samples to be played. */
export class SkinnableSound extends SkinReloadableDrawable implements IAdjustableAudioComponent {
  /** The minimum allowable volume for samples. Samples with a volume below this value will be forcefully played at this volume instead. */
  minimumSampleVolume = 0;

  override get removeWhenNotAlive(): boolean {
    return false;
  }

  override get removeCompletedTransforms(): boolean {
    return false;
  }

  override set removeCompletedTransforms(_value: boolean) {
  }

  /**
   * Whether to play the underlying sample when aggregate volume is zero.
   * Note this only checks on a call to play. This is used primarily to ensure that long-running (looping) samples continue even if
   * the user sets the volume to zero, so that they resume at the correct point when the volume is raised again.
   */
  protected get playWhenZeroVolume(): boolean {
    return this.looping;
  }

  /** All raw DrawableSamples contained in this SkinnableSound. */
  protected get drawableSamples(): DrawableSample[] {
    return this.samplesContainer.children.map(c => c.sample).filter((s): s is DrawableSample => s !== null);
  }

  private readonly samplesContainer: AudioContainer<PoolableSkinnableSample>;

  private samplePool: IPooledSampleProvider | null = null;

  /** Creates a new SkinnableSound, optionally with some initial samples. */
  constructor(samples: ISampleInfo | readonly ISampleInfo[] = []) {
    super();

    this.internalChild = this.samplesContainer = new AudioContainer<PoolableSkinnableSample>();

    this.samplesBacking = Array.isArray(samples) ? [...samples] : [samples as ISampleInfo];
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.samplePool = dependencies.get(IPooledSampleProvider);

    return r;
  }

  private samplesBacking: readonly ISampleInfo[];

  /** The samples that should be played. */
  get samples(): readonly ISampleInfo[] {
    return this.samplesBacking;
  }

  set samples(value: readonly ISampleInfo[]) {
    if (this.samplesBacking === value)
      return;

    this.samplesBacking = value;

    if (this.loadState >= LoadState.Ready)
      this.updateSamples();
  }

  clearSamples(): void {
    this.samples = [];
  }

  private loopingBacking = false;

  /** Whether the samples should loop on completion. */
  get looping(): boolean {
    return this.loopingBacking;
  }

  set looping(value: boolean) {
    if (value === this.loopingBacking) return;

    this.loopingBacking = value;

    for (const c of this.samplesContainer.children)
      c.looping = this.loopingBacking;
  }

  /** Plays the samples. */
  play(): void {
    this.flushPendingSkinChanges();

    for (const c of this.samplesContainer.children) {
      if (this.playWhenZeroVolume || c.aggregateVolume.value > 0) {
        c.stop();
        c.play();
      }
    }
  }

  protected override loadAsyncComplete(): void {
    // ensure samples are constructed before SkinChanged() is called via base.LoadAsyncComplete().
    if (this.samplesContainer.count === 0)
      this.updateSamples();

    super.loadAsyncComplete();
  }

  /** Stops the samples. */
  stop(): void {
    for (const c of this.samplesContainer.children)
      c.stop();
  }

  private updateSamples(): void {
    const wasPlaying = this.isPlaying;

    if (wasPlaying && this.looping)
      this.stop();

    // Remove all pooled samples (return them to the pool), and dispose the rest.
    this.samplesContainer.removeAll(s => s.isInPool, false);
    this.samplesContainer.clear();

    for (const s of this.samplesBacking) {
      const sample = this.samplePool?.getPooledSample(s) ?? new PoolableSkinnableSample(s);

      sample.looping = this.looping;
      sample.volume.value = Math.max(s.volume, this.minimumSampleVolume) / 100.0;

      this.samplesContainer.add(sample);
    }

    if (wasPlaying && this.looping)
      this.play();
  }

  // #region Re-expose AudioContainer

  get volume(): BindableDouble { return this.samplesContainer.volume; }
  get balance(): BindableDouble { return this.samplesContainer.balance; }
  get frequency(): BindableDouble { return this.samplesContainer.frequency; }
  get tempo(): BindableDouble { return this.samplesContainer.tempo; }

  bindAdjustments(component: IAggregateAudioAdjustment): void { this.samplesContainer.bindAdjustments(component); }
  unbindAdjustments(component: IAggregateAudioAdjustment): void { this.samplesContainer.unbindAdjustments(component); }
  addAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void { this.samplesContainer.addAdjustment(type, adjustBindable); }
  removeAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void { this.samplesContainer.removeAdjustment(type, adjustBindable); }
  removeAllAdjustments(type: AdjustableProperty): void { this.samplesContainer.removeAllAdjustments(type); }

  /** Whether any samples are currently playing. */
  get isPlaying(): boolean {
    return this.samplesContainer.children.some(s => s.playing);
  }

  /** Whether any samples have been played. */
  get isPlayed(): boolean {
    return this.samplesContainer.children.some(s => s.played);
  }

  get aggregateVolume(): Bindable<number> { return this.samplesContainer.aggregateVolume; }
  get aggregateBalance(): Bindable<number> { return this.samplesContainer.aggregateBalance; }
  get aggregateFrequency(): Bindable<number> { return this.samplesContainer.aggregateFrequency; }
  get aggregateTempo(): Bindable<number> { return this.samplesContainer.aggregateTempo; }

  // #endregion
}
