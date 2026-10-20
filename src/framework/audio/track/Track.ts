// Ported from osu.Framework/Audio/Track/Track.cs (and ITrack.cs). Seek/Start/Stop have no async variants: they are synchronous here.

import { Signal } from '../../bindables/Signal';
import { AdjustableAudioComponent, AdjustableProperty } from '../AudioComponent';
import type { AudioMixer, IAudioChannel } from '../mixing/AudioMixer';
import { ChannelAmplitudes } from './ChannelAmplitudes';

export abstract class Track extends AdjustableAudioComponent implements IAudioChannel {
  /** Invoked when the track has completed playback. */
  readonly completed = new Signal();

  /** Invoked when the track has failed (e.g. a decoding error). */
  readonly failed = new Signal();

  protected raiseCompleted(): void {
    this.completed.emit();
  }

  protected raiseFailed(): void {
    this.failed.emit();
  }

  /** Is this track capable of producing audio? */
  get isDummyDevice(): boolean {
    return true;
  }

  private _looping = false;

  /** States if this track should repeat. */
  get looping(): boolean {
    return this._looping;
  }

  set looping(value: boolean) {
    this._looping = value;
  }

  private _restartPoint = 0;

  /** Point in time in milliseconds to restart the track to on loop or restart. */
  get restartPoint(): number {
    return this._restartPoint;
  }

  set restartPoint(value: number) {
    this._restartPoint = value;
  }

  protected constructor(readonly name: string) {
    super();
  }

  /** Reset this track to a logical default state. */
  reset(): void {
    this.volume.value = 1;

    this.resetSpeedAdjustments();

    this.stop();
    this.seek(0);
  }

  /** Restarts this track from the restartPoint while retaining adjustments. */
  restart(): void {
    this.stop();
    this.seek(this.restartPoint);
    this.start();
  }

  resetSpeedAdjustments(): void {
    this.removeAllAdjustments(AdjustableProperty.Frequency);
    this.removeAllAdjustments(AdjustableProperty.Tempo);
  }

  /** Current position in milliseconds. */
  abstract get currentTime(): number;

  private _length = 0;

  /** Length of the track in milliseconds. */
  get length(): number {
    return this._length;
  }

  set length(value: number) {
    if (value < 0)
      throw new Error('Track length must be >= 0.');

    this._length = value;
  }

  /** The bitrate of the track, if available. */
  get bitrate(): number | null {
    return null;
  }

  /** Seek to a new position. Returns whether the seek was successful. */
  abstract seek(seek: number): boolean;

  /** Start playback. */
  abstract start(): void;

  /** Stop playback. */
  abstract stop(): void;

  abstract get isRunning(): boolean;

  /** Overall playback rate (1 is 100%, -1 is reversed at 100%). */
  get rate(): number {
    return this.aggregateFrequency.value * this.aggregateTempo.value;
  }

  get isReversed(): boolean {
    return this.rate < 0;
  }

  override get hasCompleted(): boolean {
    return this.isLoaded && !this.isRunning && this.currentTime >= this.length;
  }

  /** Current amplitude of stereo channels where 1 is full volume and 0 is silent. LeftChannel and RightChannel represent the maximum current amplitude of all of the left and right channels respectively. The most recent values are returned. Synchronisation between channels should not be expected. */
  get currentAmplitudes(): ChannelAmplitudes {
    return ChannelAmplitudes.Empty;
  }

  protected override updateState(): void {
    super.updateState();

    if (this.looping && this.hasCompleted)
      this.restart();
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
}
