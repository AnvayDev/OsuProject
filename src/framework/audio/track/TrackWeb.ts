// Ported from osu.Framework/Audio/Track/TrackBass.cs, on an HTMLAudioElement (streamed, seekable) routed through Web Audio:
// MediaElementSource → [AmplitudeProcessor, pre-volume like BASSmix] → Gain (AggregateVolume) → StereoPanner (AggregateBalance) → mixer.
//
// Deviations (no BASS_FX): playbackRate = |AggregateFrequency| × AggregateTempo, clamped to the media element's [0.0625, 16]. preservesPitch is on
// only while the frequency is 1, so frequency and tempo changes together get pitch frequency × tempo (BASS: frequency only). Reverse playback
// (negative frequency) plays forwards. Frequency 0 pauses, as in BassRelativeFrequencyHandler.
// Looping from restart point 0 uses the element's seamless loop, like the BASS loop flag. Otherwise 'ended' seeks to RestartPoint
// (TrackBass's end sync).

import { AmplitudeProcessor } from '../AmplitudeProcessor';
import { ChannelAmplitudes } from './ChannelAmplitudes';
import { Track } from './Track';

const min_playback_rate = 0.0625;
const max_playback_rate = 16;

export class TrackWeb extends Track {
  private readonly audio: HTMLAudioElement;
  private readonly url: string;

  private gain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;

  private isPlayed = false;
  private _isLoaded = false;
  private lastSeekablePosition = 0;
  private isFrequencyZero = false;

  override get isLoaded(): boolean {
    return this._isLoaded;
  }

  /** @internal */
  constructor(data: Blob, name: string) {
    super(name);

    // todo: support this internally to match the underlying Track implementation (which can support this).
    const tempo_minimum_supported = 0.05;

    this.aggregateTempo.bindValueChanged(t => {
      if (t.newValue < tempo_minimum_supported)
        throw new Error(`TrackWeb does not support Tempo specifications below ${tempo_minimum_supported}. Use Frequency instead.`);
    });

    this.url = URL.createObjectURL(data);
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.addEventListener('loadedmetadata', () => {
      const seconds = this.audio.duration;

      if (Number.isFinite(seconds) && seconds >= 0) {
        this.length = seconds * 1000;

        // BASS does not allow seeking to the end of the track, so the last available position is 1 sample before.
        this.lastSeekablePosition = this.length - 1000 / 44100;

        this._isLoaded = true;
      }
    });
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('error', () => this.raiseFailed());
    this.audio.src = this.url;

    this.invalidateState();
  }

  /** @internal */
  override attachToContext(context: BaseAudioContext): void {
    if (this.source !== null)
      return;

    this.source = (context as AudioContext).createMediaElementSource(this.audio);
    this.gain = context.createGain();
    this.panner = context.createStereoPanner();
    this.source.connect(this.gain).connect(this.panner);

    this.invalidateState();
  }

  /** @internal */
  override get output(): AudioNode | null {
    return this.panner;
  }

  private onEnded(): void {
    if (this.looping) {
      // TrackBass's end sync: seek to the restart point (the element loops by itself when it is 0).
      this.seekInternal(this.restartPoint);
      this.playElement();
      return;
    }

    this._hasCompleted = true;
    this.raiseCompleted();
  }

  private updateLoopFlag(): void {
    this.audio.loop = this.looping && !(this.restartPoint > 1);
  }

  override get looping(): boolean {
    return super.looping;
  }

  override set looping(value: boolean) {
    super.looping = value;
    this.updateLoopFlag();
  }

  override get restartPoint(): number {
    return super.restartPoint;
  }

  override set restartPoint(value: number) {
    super.restartPoint = value;
    this.updateLoopFlag();
  }

  private amplitudeProcessor: AmplitudeProcessor | null = null;

  protected override updateState(): void {
    super.updateState();

    const running = !this.audio.paused && !this.audio.ended;

    this._isRunning = running || (this.isPlayed && !this._hasCompleted);
    this.updateCurrentTime();

    this.amplitudeProcessor?.update(running);
  }

  override get isDummyDevice(): boolean {
    return false;
  }

  override stop(): void {
    this.stopInternal();
    this._isRunning = this.isPlayed = false;
  }

  private stopInternal(): void {
    this.audio.pause();
  }

  override start(): void {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    if (this.startInternal())
      this._isRunning = this.isPlayed = true;
  }

  private startInternal(): boolean {
    // ensure state is correct before starting.
    this.invalidateState();

    // Bass will restart the track if it has reached its end. This behavior isn't desirable so block locally.
    if (this._hasCompleted)
      return false;

    if (this.isFrequencyZero)
      return true;

    this.updateLoopFlag();
    this.playElement();
    return true;
  }

  private playElement(): void {
    this.audio.play().catch(() => {
      // Autoplay blocked (no user activation yet) or the source failed.
      this._isRunning = this.isPlayed = false;
    });
  }

  override seek(seek: number): boolean {
    // At this point the track may not yet be loaded which is indicated by a 0 length.
    // In that case we still want to return true, hence the conservative length.
    const conservativeLength = this.length === 0 ? Number.MAX_VALUE : this.lastSeekablePosition;
    const conservativeClamped = Math.min(Math.max(seek, 0), conservativeLength);

    this.seekInternal(seek);

    return conservativeClamped === seek;
  }

  private seekInternal(seek: number): void {
    const clamped = Math.min(Math.max(seek, 0), this.length);

    if (clamped < this.length)
      this._hasCompleted = false;

    if (Math.abs(this.audio.currentTime * 1000 - clamped) > 1e-6)
      this.audio.currentTime = clamped / 1000;

    this.updateCurrentTime();
  }

  private updateCurrentTime(): void {
    this._currentTime = this.audio.currentTime * 1000;
  }

  private _currentTime = 0;

  override get currentTime(): number {
    return this._currentTime;
  }

  private _isRunning = false;

  override get isRunning(): boolean {
    return this._isRunning;
  }

  private _hasCompleted = false;

  override get hasCompleted(): boolean {
    return this._hasCompleted;
  }

  override onStateChanged(): void {
    super.onStateChanged();

    if (this.gain !== null)
      this.gain.gain.value = this.aggregateVolume.value;
    if (this.panner !== null)
      this.panner.pan.value = this.aggregateBalance.value;

    this.setFrequency(this.aggregateFrequency.value);

    const rate = Math.abs(this.aggregateFrequency.value) * Math.abs(this.aggregateTempo.value);
    if (rate > 0)
      this.audio.playbackRate = Math.min(Math.max(rate, min_playback_rate), max_playback_rate);
    this.audio.preservesPitch = this.aggregateFrequency.value === 1;
  }

  /** BassRelativeFrequencyHandler: maintain an internal pause on zero frequency. */
  private setFrequency(relativeFrequency: number): void {
    if (!this.isFrequencyZero && relativeFrequency === 0) {
      this.stopInternal();
      this.isFrequencyZero = true;
    } else if (this.isFrequencyZero && relativeFrequency > 0) {
      this.isFrequencyZero = false;

      // Do not resume the track if a play wasn't requested at all or has been paused via Stop().
      if (this.isPlayed)
        this.startInternal();
    }
  }

  override get currentAmplitudes(): ChannelAmplitudes {
    if (this.source === null)
      return ChannelAmplitudes.Empty;

    return (this.amplitudeProcessor ??= new AmplitudeProcessor(this.source)).currentAmplitudes;
  }

  protected override onDispose(disposing: boolean): void {
    if (!this.isDisposed) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      URL.revokeObjectURL(this.url);
      this.panner?.disconnect();
    }

    super.onDispose(disposing);
  }
}
