// Ported from osu.Framework/Graphics/Audio/DrawableTrack.cs
// The async Start/Stop/Seek/Restart variants are the synchronous calls (Track has no async variants here). The Completed/Failed events are the
// track's signals.

import { AdjustableProperty } from '../../audio/AudioComponent';
import type { Signal } from '../../bindables/Signal';
import type { ChannelAmplitudes } from '../../audio/track/ChannelAmplitudes';
import type { Track } from '../../audio/track/Track';
import { DrawableAudioWrapper } from './DrawableAudioWrapper';

/** A DrawableAudioWrapper that wraps a Track and exposes its properties. */
export class DrawableTrack extends DrawableAudioWrapper {
  private readonly track: Track;

  /** Construct a new drawable track instance. disposeTrackOnDisposal: whether the track should be automatically disposed on drawable disposal/expiry. */
  constructor(track: Track, disposeTrackOnDisposal = true) {
    super(track, disposeTrackOnDisposal);

    this.track = track;
  }

  get completed(): Signal { return this.track.completed; }

  get failed(): Signal { return this.track.failed; }

  get looping(): boolean { return this.track.looping; }

  set looping(value: boolean) { this.track.looping = value; }

  get isDummyDevice(): boolean { return this.track.isDummyDevice; }

  get restartPoint(): number { return this.track.restartPoint; }

  set restartPoint(value: number) { this.track.restartPoint = value; }

  get currentTime(): number { return this.track.currentTime; }

  get rate(): number { return this.track.rate; }

  set rate(value: number) { this.track.rate = value; }

  get length(): number { return this.track.length; }

  set length(value: number) { this.track.length = value; }

  get bitrate(): number | null { return this.track.bitrate; }

  get isRunning(): boolean { return this.track.isRunning; }

  get isReversed(): boolean { return this.track.isReversed; }

  get hasCompleted(): boolean { return this.track.hasCompleted; }

  /** Reset this track to a logical default state. */
  reset(): void {
    this.volume.value = 1;

    this.resetSpeedAdjustments();

    this.stop();
    this.seek(0);
  }

  restart(): void { this.track.restart(); }

  resetSpeedAdjustments(): void {
    this.removeAllAdjustments(AdjustableProperty.Frequency);
    this.removeAllAdjustments(AdjustableProperty.Tempo);
  }

  seek(seek: number): boolean { return this.track.seek(seek); }

  start(): void { this.track.start(); }

  stop(): void { this.track.stop(); }

  get currentAmplitudes(): ChannelAmplitudes { return this.track.currentAmplitudes; }

  get trackLoaded(): boolean { return this.track.isLoaded; }

  protected override onParentLost(): void {
    super.onParentLost();

    // Relying on disposal for this can cause delays before audio stops playing.
    try {
      this.stop();
    } catch (e) {
      console.log(`Failed to stop audio track on losing parent: ${e}`);
    }
  }
}
