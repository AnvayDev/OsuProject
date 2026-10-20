// Ported from osu.Framework/Audio/Sample/SampleBassFactory.cs, SampleBass.cs and SampleChannelBass.cs, on a decoded AudioBuffer:
// each playback is an AudioBufferSourceNode → [AmplitudeProcessor, pre-volume] → Gain (AggregateVolume) → StereoPanner (AggregateBalance) → mixer.
// Frequency is the source's playbackRate (pitch changes, like BASS_ATTRIB_FREQ, min 100 Hz); frequency 0 pauses.

import { Bindable } from '../../bindables/Bindable';
import { AmplitudeProcessor } from '../AmplitudeProcessor';
import { AdjustableAudioComponent } from '../AudioComponent';
import { AudioCollectionManager } from '../AudioCollectionManager';
import type { AudioMixer } from '../mixing/AudioMixer';
import { ChannelAmplitudes } from '../track/ChannelAmplitudes';
import { Sample } from './Sample';
import { SampleChannel } from './SampleChannel';

/** @internal Decodes a sample's data once; creates Samples sharing the decoded buffer. */
export class SampleWebFactory extends AudioCollectionManager<AdjustableAudioComponent> {
  buffer: AudioBuffer | null = null;

  override get isLoaded(): boolean {
    return this.buffer !== null;
  }

  get length(): number {
    return this.buffer === null ? 0 : this.buffer.duration * 1000;
  }

  readonly playbackConcurrency = new Bindable<number>(Sample.DEFAULT_CONCURRENCY);

  readonly loaded: Promise<void>;

  constructor(data: Blob, readonly name: string, private readonly mixer: AudioMixer) {
    super();

    this.loaded = data.arrayBuffer()
      .then(bytes => mixer.context.decodeAudioData(bytes))
      .then(b => { this.buffer = b; }, () => { /* malformed data: the sample stays unloaded and plays nothing, like a failed BASS_SampleLoad */ });
  }

  createSample(): Sample {
    const sample = new SampleWeb(this, this.mixer);
    sample.onPlay = s => this.addItem(s);
    return sample;
  }
}

class SampleWeb extends Sample {
  override get isLoaded(): boolean {
    return this.factory.isLoaded;
  }

  override get length(): number {
    return this.factory.length;
  }

  constructor(private readonly factory: SampleWebFactory, private readonly mixer: AudioMixer) {
    super(factory.name);

    this.playbackConcurrency.bindTo(factory.playbackConcurrency);
  }

  protected override createChannel(): SampleChannel {
    const channel = new SampleChannelWeb(this.factory);
    this.mixer.add(channel);
    return channel;
  }
}

class SampleChannelWeb extends SampleChannel {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private context: BaseAudioContext | null = null;

  private playing_ = false;
  private userRequestedPlay = false;
  private isFrequencyZero = false;

  /** Playback position (seconds into the buffer) when paused by zero frequency, and the context time playback last (re)started. */
  private offset = 0;
  private startedAt = 0;

  override get playing(): boolean {
    // When short samples loop (especially within mixers), there's a small window where the ChannelIsActive state could be Stopped.
    // In order to not provide a "stale" value here, we'll not trust the internal playing state from BASS.
    if (this.looping && this.userRequestedPlay)
      return true;

    return this.playing_;
  }

  override get looping(): boolean {
    return super.looping;
  }

  override set looping(value: boolean) {
    super.looping = value;
    if (this.source !== null)
      this.source.loop = value;
  }

  constructor(private readonly factory: SampleWebFactory) {
    super(factory.name);
  }

  /** @internal */
  override attachToContext(context: BaseAudioContext): void {
    if (this.context !== null)
      return;

    this.context = context;
    this.gain = context.createGain();
    this.panner = context.createStereoPanner();
    this.gain.connect(this.panner);
    this.invalidateState();
  }

  /** @internal */
  override get output(): AudioNode | null {
    return this.panner;
  }

  private amplitudeProcessor: AmplitudeProcessor | null = null;

  protected override updateState(): void {
    super.updateState();

    this.amplitudeProcessor?.update(this.playing_ && !this.isFrequencyZero);
  }

  override play(): void {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    this.userRequestedPlay = true;

    // Bring this channel alive, allowing it to receive updates.
    super.play();

    if (this.playInternal())
      this.playing_ = true;
  }

  override stop(): void {
    this.userRequestedPlay = false;

    super.stop();

    this.stopInternal();
    this.playing_ = false;
  }

  override onStateChanged(): void {
    super.onStateChanged();

    if (this.gain === null)
      return;

    this.gain.gain.value = this.aggregateVolume.value;
    this.panner!.pan.value = this.aggregateBalance.value;
    this.setFrequency(this.aggregateFrequency.value);
  }

  /** BASS_ATTRIB_FREQ = initial × |relative| (min 100 Hz); relative 0 pauses (BassRelativeFrequencyHandler). */
  private setFrequency(relativeFrequency: number): void {
    const buffer = this.factory.buffer;
    if (this.source !== null && buffer !== null) {
      this.advanceOffset();
      this.source.playbackRate.value = Math.max(100 / buffer.sampleRate, Math.abs(relativeFrequency));
    }

    if (!this.isFrequencyZero && relativeFrequency === 0) {
      this.stopInternal();
      this.isFrequencyZero = true;
    } else if (this.isFrequencyZero && relativeFrequency > 0) {
      this.isFrequencyZero = false;

      // Only unpause if the channel has been played by the user.
      if (this.userRequestedPlay)
        this.playInternal();
    }
  }

  private playInternal(): boolean {
    const buffer = this.factory.buffer;

    if (this.context === null || buffer === null)
      return false;

    // Ensure state is correct before starting.
    this.invalidateState();

    // Bass will restart the sample if it has reached its end. This behavior isn't desirable so block locally.
    if (this.played && this.source === null && this.offset >= buffer.duration)
      return false;

    if (this.isFrequencyZero)
      return true;

    if (this.source !== null)
      return true;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = this.looping;
    source.playbackRate.value = Math.max(100 / buffer.sampleRate, Math.abs(this.aggregateFrequency.value));
    source.connect(this.gain!);
    source.onended = () => {
      if (this.source !== source)
        return;

      this.source = null;
      this.offset = buffer.duration;
      this.playing_ = false;
    };

    if (this.amplitudeProcessor !== null)
      source.connect(this.amplitudeProcessorInput!);

    this.startedAt = this.context.currentTime;
    source.start(0, this.offset);
    this.source = source;
    return true;
  }

  private advanceOffset(): void {
    if (this.source === null || this.context === null)
      return;

    const buffer = this.factory.buffer!;
    this.offset += (this.context.currentTime - this.startedAt) * this.source.playbackRate.value;
    if (this.looping) this.offset %= buffer.duration;
    this.startedAt = this.context.currentTime;
  }

  private stopInternal(): void {
    if (this.source === null)
      return;

    this.advanceOffset();

    const source = this.source;
    this.source = null;
    source.onended = null;
    source.stop();
    source.disconnect();
  }

  /** The node amplitudes are measured on (pre-volume); created on first access to currentAmplitudes. */
  private amplitudeProcessorInput: GainNode | null = null;

  override get currentAmplitudes(): ChannelAmplitudes {
    if (this.context === null)
      return ChannelAmplitudes.Empty;

    if (this.amplitudeProcessor === null) {
      this.amplitudeProcessorInput = this.context.createGain();
      this.amplitudeProcessor = new AmplitudeProcessor(this.amplitudeProcessorInput);
      this.source?.connect(this.amplitudeProcessorInput);
    }

    return this.amplitudeProcessor.currentAmplitudes;
  }

  protected override onDispose(disposing: boolean): void {
    if (this.isDisposed)
      return;

    this.stopInternal();
    this.panner?.disconnect();
    this.playing_ = false;

    super.onDispose(disposing);
  }
}
