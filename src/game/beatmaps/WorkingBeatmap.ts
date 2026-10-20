// Ported from osu.Game/Beatmaps/WorkingBeatmap.cs (and IWorkingBeatmap.cs). Storyboards, skins, waveforms and GetPlayableBeatmap are gameplay or
// editor features and are not ported. Decoding reads from IndexedDB, so the C# `Beatmap` getter (which blocks) is the value once
// loadBeatmapAsync() has settled; getBackground() and getStream() return Promises.

import type { AudioManager } from '@fw/audio/AudioManager';
import type { Track } from '@fw/audio/track/Track';
import type { Texture } from '@fw/graphics/textures/Texture';
import { Logger } from '@fw/logging/Logger';
import { Beatmap, type IBeatmap } from './Beatmap';
import type { BeatmapInfo } from './BeatmapInfo';
import type { BeatmapMetadata } from './BeatmapMetadata';
import { BeatmapSetInfo } from './BeatmapSetInfo';

/** MusicController.DELAY_BEFORE_FADE */
const delay_before_fade = 30;

export abstract class WorkingBeatmap {
  readonly beatmapInfo: BeatmapInfo;
  readonly beatmapSetInfo: BeatmapSetInfo;

  // TODO: remove once the fallback lookup is not required (and access via `working.BeatmapInfo.Metadata` directly).
  get metadata(): BeatmapMetadata {
    return this.beatmapInfo.metadata;
  }

  private _track: Track | null = null; // track is not Lazy as we allow transferring and loading multiple times.

  protected constructor(beatmapInfo: BeatmapInfo, private readonly audioManager: AudioManager) {
    this.beatmapInfo = beatmapInfo;
    this.beatmapSetInfo = beatmapInfo.beatmapSet ?? new BeatmapSetInfo();
  }

  // #region Resource getters

  protected abstract getBeatmap(): Promise<IBeatmap | null>;

  abstract getBackground(): Promise<Texture | null>;

  getPanelBackground(): Promise<Texture | null> {
    return this.getBackground();
  }

  protected abstract getBeatmapTrack(): Track | null;

  /** Get the stream of a file (by storage path) from this beatmap's set. */
  abstract getStream(storagePath: string): Promise<Uint8Array | null>;

  // #endregion

  // #region Async load control

  /** Beings loading the contents of this WorkingBeatmap's beatmap asynchronously. */
  beginAsyncLoad(): void {
    void this.loadBeatmapAsync();
  }

  /** Cancels the asynchronous loading of the contents of this WorkingBeatmap's beatmap. */
  cancelAsyncLoad(): void {
    if (!this.beatmapLoaded)
      this.beatmapLoadTask = null;
  }

  // #endregion

  // #region Track

  get trackLoaded(): boolean {
    return this._track !== null;
  }

  /** Get the loaded audio track instance. loadTrack must have first been called. This generally happens via MusicController when changing the global beatmap. */
  get track(): Track {
    if (!this.trackLoaded)
      throw new Error('Cannot access Track without first calling LoadTrack.');

    return this._track!;
  }

  /** Retrieves the Track which this WorkingBeatmap contains. Can be called multiple times, returning a new track each time. */
  loadTrack(): Track {
    this._track = this.getBeatmapTrack() ?? this.getVirtualTrack(1000);
    return this._track;
  }

  /**
   * Reads the correct track restart point from beatmap metadata and sets looping to enabled.
   * offsetFromPreviewPoint: an offset to apply to the preview point (default -MusicController.DELAY_BEFORE_FADE).
   */
  prepareTrackForPreview(looping: boolean, offsetFromPreviewPoint: number | null = null): void {
    const track = this.track;

    track.looping = looping;
    track.restartPoint = this.metadata.previewTime;

    // C# forces Length to be populated (https://github.com/ppy/osu-framework/issues/4202) by blocking in Track.Seek until the track has loaded.
    // A web track loads asynchronously, so the rest runs on the track's action queue: after the load, and before anything (e.g. a restart)
    // queued after this call.
    void track.enqueueAction(() => {
      if (track.restartPoint < 0 || track.restartPoint > track.length)
        track.restartPoint = Math.fround(0.4) * track.length;

      offsetFromPreviewPoint ??= -delay_before_fade;

      track.restartPoint = Math.min(Math.max(track.restartPoint + offsetFromPreviewPoint, 0), track.length);
    });
  }

  /**
   * Transfer a valid audio track into this working beatmap. Used as an optimisation to avoid reload / track swap across difficulties in the
   * same beatmap set. Returns whether the track was transferred.
   */
  tryTransferTrack(target: WorkingBeatmap): boolean {
    if (this.beatmapInfo.audioEquals(target.beatmapInfo) !== true || this.track.isDummyDevice)
      return false;

    target._track = this.track;
    return true;
  }

  /** emptyLength: C# uses it when BeatmapInfo is null, which it never is. */
  protected getVirtualTrack(_emptyLength = 0): Track {
    const excess_length = 1000;

    const length = this.beatmapInfo.length + excess_length;

    return this.audioManager.tracks.getVirtual(length);
  }

  // #endregion

  // #region Beatmap

  get beatmapLoaded(): boolean {
    return this.loadedBeatmap !== undefined;
  }

  /** The decoded beatmap once loaded (C# blocks until it is), else null. */
  get beatmap(): IBeatmap | null {
    return this.loadedBeatmap ?? null;
  }

  private loadedBeatmap: IBeatmap | null | undefined = undefined;

  private beatmapLoadTask: Promise<IBeatmap | null> | null = null;

  /** The awaitable form of C#'s `Beatmap` getter. */
  loadBeatmapAsync(): Promise<IBeatmap | null> {
    if (this.beatmapLoadTask !== null)
      return this.beatmapLoadTask;

    const task: Promise<IBeatmap | null> = (async () => {
      const b = await this.getBeatmap() ?? new Beatmap();

      // Copy across values of key properties for which the database-backed model has data that the decoded beatmap isn't going to.
      b.beatmapInfo.id = this.beatmapInfo.id;
      b.beatmapInfo.userSettings = this.beatmapInfo.userSettings;
      b.beatmapInfo.beatmapSet = this.beatmapInfo.beatmapSet;
      b.beatmapInfo.status = this.beatmapInfo.status;
      b.beatmapInfo.onlineID = this.beatmapInfo.onlineID;
      b.beatmapInfo.onlineMD5Hash = this.beatmapInfo.onlineMD5Hash;
      b.beatmapInfo.lastLocalUpdate = this.beatmapInfo.lastLocalUpdate;
      b.beatmapInfo.lastOnlineUpdate = this.beatmapInfo.lastOnlineUpdate;
      b.beatmapInfo.lastPlayed = this.beatmapInfo.lastPlayed;
      b.beatmapInfo.editorTimestamp = this.beatmapInfo.editorTimestamp;
      b.beatmapInfo.starRating = this.beatmapInfo.starRating; // this could be recomputed in the decoding process but it's a bit annoying to do.

      return b;
    })().then(
      b => {
        // a cancelled load is not published (a later access starts a new one)
        if (this.beatmapLoadTask === task)
          this.loadedBeatmap = b;
        return b;
      },
      e => {
        Logger.error(e, `Beatmap failed to load (${this.beatmapInfo})`);
        if (this.beatmapLoadTask === task)
          this.loadedBeatmap = null;
        return null;
      });

    return this.beatmapLoadTask = task;
  }

  // #endregion

  toString(): string {
    return this.beatmapInfo.toString();
  }
}
