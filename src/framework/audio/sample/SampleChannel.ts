// Ported from osu.Framework/Audio/Sample/SampleChannel.cs (and ISampleChannel.cs)

import { AdjustableAudioComponent } from '../AudioComponent';
import type { AudioMixer, IAudioChannel } from '../mixing/AudioMixer';
import { ChannelAmplitudes } from '../track/ChannelAmplitudes';

export abstract class SampleChannel extends AdjustableAudioComponent implements IAudioChannel {
  /** @internal */
  onPlay: ((channel: SampleChannel) => void) | null = null;

  protected constructor(readonly name: string) {
    super();
  }

  /** Starts or resumes playback. Has no effect if this SampleChannel is already playing. */
  play(): void {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    this._played = true;
    this.onPlay?.(this);
  }

  /** Stops playback. */
  stop(): void {
  }

  private _played = false;

  /** Whether the sample was played. */
  get played(): boolean {
    return this._played;
  }

  /** Whether the sample is playing. */
  abstract get playing(): boolean;

  private _looping = false;

  /** Whether the sample is looping. */
  get looping(): boolean {
    return this._looping;
  }

  set looping(value: boolean) {
    this._looping = value;
  }

  override get isAlive(): boolean {
    return this.manualFree ? super.isAlive : super.isAlive && this.playing;
  }

  get currentAmplitudes(): ChannelAmplitudes {
    return ChannelAmplitudes.Empty;
  }

  // #region Mixing

  /** @internal */
  mixer: AudioMixer | null = null;

  /** @internal */
  get output(): AudioNode | null {
    return null;
  }

  /** @internal */
  attachToContext(_context: BaseAudioContext): void {
  }

  // #endregion

  /** If true, the channel will not be freed (disposed) when it stops playing; it must be disposed manually. */
  manualFree = false;

  protected override onDispose(disposing: boolean): void {
    if (!this.isDisposed)
      this.stop();

    super.onDispose(disposing);
  }
}
