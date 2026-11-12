// Ported from osu.Game/Beatmaps/WorkingBeatmap.cs (and IWorkingBeatmap.cs). Storyboards, skins and waveforms are not ported. Decoding reads from IndexedDB, so the C# `Beatmap` getter (which blocks) is the value once
// loadBeatmapAsync() has settled; getBackground() and getStream() return Promises.

import type { AudioManager } from '@fw/audio/AudioManager';
import type { Track } from '@fw/audio/track/Track';
import type { Texture } from '@fw/graphics/textures/Texture';
import { Logger } from '@fw/logging/Logger';
import { Beatmap, type IBeatmap } from './Beatmap';
import type { BeatmapInfo } from './BeatmapInfo';
import type { BeatmapMetadata } from './BeatmapMetadata';
import { BeatmapSetInfo } from './BeatmapSetInfo';
import { IApplicableToDifficulty } from '../rulesets/mods/IApplicableToDifficulty';
import type { Mod } from '../rulesets/mods/Mod';
import type { Ruleset } from '../rulesets/Ruleset';
import type { RulesetInfo } from '../rulesets/RulesetInfo';
import type { IBeatmapConverter } from './BeatmapConverter';

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

  /**
   * Constructs a playable IBeatmap from beatmap using the applicable converters for a specific RulesetInfo.
   * The returned IBeatmap is in a playable state - all HitObject and BeatmapDifficulty Mods have been applied, and HitObjects have been fully constructed.
   * The beatmap must have been loaded (loadBeatmapAsync); C# blocks on the load here.
   */
  getPlayableBeatmap(ruleset: RulesetInfo, mods: readonly Mod[] = []): IBeatmap {
    const rulesetInstance = ruleset.createInstance();

    if (rulesetInstance === null)
      throw new Error('Creating ruleset instance failed when attempting to create playable beatmap.');

    const beatmap = this.beatmap;

    if (beatmap === null)
      throw new Error('The beatmap must be loaded before a playable beatmap can be created.');

    const converter = this.createBeatmapConverter(beatmap, rulesetInstance);

    // Check if the beatmap can be converted
    if (beatmap.hitObjects.length > 0 && !converter.canConvert())
      throw new Error(`Beatmap can not be converted for the ruleset (ruleset: ${ruleset.instantiationInfo}).`);

    // Apply conversion mods (IApplicableToBeatmapConverter: none of the ported mods implement it yet)

    // Convert
    const converted = converter.convert();

    // Apply conversion mods to the result (IApplicableAfterBeatmapConversion: none ported yet)

    // Apply difficulty mods
    for (const mod of mods) {
      if (mod instanceof IApplicableToDifficulty)
        mod.applyToDifficulty(converted.difficulty);
    }

    const processor = rulesetInstance.createBeatmapProcessor(converted);

    // (IApplicableToBeatmapProcessor: none ported yet)
    processor?.preProcess();

    // Compute default values for hitobjects, including creating nested hitobjects in-case they're needed
    for (const obj of converted.hitObjects)
      obj.applyDefaults(converted.controlPointInfo, converted.difficulty);

    // (IApplicableToHitObject: none ported yet)

    processor?.postProcess();

    // (IApplicableToBeatmap: none ported yet)

    return converted;
  }

  /** Creates a IBeatmapConverter to convert a IBeatmap for a specified Ruleset. */
  protected createBeatmapConverter(beatmap: IBeatmap, ruleset: Ruleset): IBeatmapConverter {
    return ruleset.createBeatmapConverter(beatmap);
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
