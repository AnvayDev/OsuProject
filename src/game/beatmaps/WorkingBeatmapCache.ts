// Ported from osu.Game/Beatmaps/WorkingBeatmapCache.cs (and IWorkingBeatmapCache.cs / IBeatmapResourceProvider.cs). Files are read from the
// IndexedDB file store by hash. The panel background store's crop (BeatmapPanelBackgroundTextureLoaderStore keeps a 512:80 centre strip) is
// not reproduced: panels show the background with FillMode.Fill and are always at least that wide, so the visible part is the same.

import type { AudioManager } from '@fw/audio/AudioManager';
import type { Track } from '@fw/audio/track/Track';
import type { TrackStore } from '@fw/audio/track/TrackStore';
import type { Texture } from '@fw/graphics/textures/Texture';
import { LargeTextureStore, type TextureStore } from '@fw/graphics/textures/TextureStore';
import { computeMD5Hash, computeSHA2Hash } from '@fw/extensions/ExtensionMethods';
import { Logger, LogLevel, LoggingTarget } from '@fw/logging/Logger';
import type { RealmFileStore } from '../database/RealmFileStore';
import { LineBufferedReader } from '../io/LineBufferedReader';
import { Beatmap, type IBeatmap } from './Beatmap';
import type { BeatmapInfo } from './BeatmapInfo';
import { updateStatisticsFromBeatmap } from './BeatmapInfoExtensions';
import type { BeatmapSetInfo } from './BeatmapSetInfo';
import { Decoder } from './formats/Decoder';
import './formats/LegacyBeatmapDecoder';
import { WorkingBeatmap } from './WorkingBeatmap';

export interface IWorkingBeatmapCache {
  /** Retrieve a WorkingBeatmap instance for the provided BeatmapInfo. */
  getWorkingBeatmap(beatmapInfo: BeatmapInfo | null): WorkingBeatmap;

  /** Invalidate a cache entry if it exists. */
  invalidate(info: BeatmapSetInfo | BeatmapInfo): void;
}

/** IBeatmapResourceProvider */
interface BeatmapResourceProvider {
  readonly largeTextureStore: TextureStore;
  readonly beatmapPanelTextureStore: TextureStore;
  readonly tracks: TrackStore;
  readonly audioManager: AudioManager;
  readonly files: RealmFileStore;
}

/** Beatmap files may specify this filename to denote that they don't have an audio track. */
const virtual_track_filename = 'virtual';

export class WorkingBeatmapCache implements IWorkingBeatmapCache, BeatmapResourceProvider {
  private workingCache: WeakRef<BeatmapManagerWorkingBeatmap>[] = [];

  readonly largeTextureStore: TextureStore;
  readonly beatmapPanelTextureStore: TextureStore;

  constructor(readonly tracks: TrackStore, readonly audioManager: AudioManager, readonly files: RealmFileStore, readonly defaultBeatmap: WorkingBeatmap) {
    this.largeTextureStore = new LargeTextureStore(files.store);
    this.beatmapPanelTextureStore = this.largeTextureStore;
  }

  invalidate(info: BeatmapSetInfo | BeatmapInfo): void {
    if ('beatmaps' in info) {
      for (const b of info.beatmaps)
        this.invalidate(b);
      return;
    }

    const working = this.find(info);

    if (working !== null) {
      Logger.log(`Invalidating working beatmap cache for ${info}`);
      this.workingCache = this.workingCache.filter(w => w.deref() !== working);
    }
  }

  getWorkingBeatmap(beatmapInfo: BeatmapInfo | null): WorkingBeatmap {
    if (beatmapInfo === null || beatmapInfo === this.defaultBeatmap.beatmapInfo)
      return this.defaultBeatmap;

    const existing = this.find(beatmapInfo);

    if (existing !== null)
      return existing;

    const working = new BeatmapManagerWorkingBeatmap(beatmapInfo, this);
    this.workingCache.push(new WeakRef(working));
    return working;
  }

  /** WeakList.FirstOrDefault(w => info.Equals(w.BeatmapInfo)), dropping collected entries. */
  private find(info: BeatmapInfo): BeatmapManagerWorkingBeatmap | null {
    this.workingCache = this.workingCache.filter(w => w.deref() !== undefined);
    return this.workingCache.map(w => w.deref()!).find(w => info.equals(w.beatmapInfo)) ?? null;
  }
}

class BeatmapManagerWorkingBeatmap extends WorkingBeatmap {
  constructor(beatmapInfo: BeatmapInfo, private readonly resources: BeatmapResourceProvider) {
    super(beatmapInfo, resources.audioManager);
  }

  protected override async getBeatmap(): Promise<IBeatmap | null> {
    const path = this.beatmapInfo.path;

    if (path === null) {
      const beatmap = new Beatmap();
      beatmap.beatmapInfo = this.beatmapInfo;
      return beatmap;
    }

    try {
      const fileStorePath = this.beatmapSetInfo.getPathForFile(path);

      const stream = fileStorePath === null ? null : await this.getStream(fileStorePath);

      if (stream === null) {
        Logger.log(`Beatmap failed to load (file ${path} not found on disk at expected location ${fileStorePath}).`, LoggingTarget.Runtime, LogLevel.Error);
        return null;
      }

      const streamMD5 = computeMD5Hash(stream);
      const streamSHA2 = await computeSHA2Hash(stream);

      if (streamMD5 !== this.beatmapInfo.md5Hash) {
        Logger.log(`Beatmap failed to load (file ${path} does not have the expected hash).`, LoggingTarget.Runtime, LogLevel.Error);
        return null;
      }

      const reader = new LineBufferedReader(stream);
      const beatmap = Decoder.getDecoder(Beatmap, reader).decode(reader);

      beatmap.beatmapInfo.md5Hash = streamMD5;
      beatmap.beatmapInfo.hash = streamSHA2;
      updateStatisticsFromBeatmap(beatmap.beatmapInfo, beatmap);

      return beatmap;
    } catch (e) {
      Logger.error(e, 'Beatmap failed to load');
      return null;
    }
  }

  override getPanelBackground(): Promise<Texture | null> {
    return this.getBackgroundFromStore(this.resources.beatmapPanelTextureStore);
  }

  override getBackground(): Promise<Texture | null> {
    return this.getBackgroundFromStore(this.resources.largeTextureStore);
  }

  private async getBackgroundFromStore(store: TextureStore): Promise<Texture | null> {
    if (!this.metadata?.backgroundFile)
      return null;

    try {
      const fileStorePath = this.beatmapSetInfo.getPathForFile(this.metadata.backgroundFile);
      const texture = await store.get(fileStorePath);

      if (texture === null) {
        Logger.log(`Beatmap background failed to load (file ${this.metadata.backgroundFile} not found on disk at expected location ${fileStorePath}).`);
        return null;
      }

      return texture;
    } catch (e) {
      Logger.error(e, 'Background failed to load');
      return null;
    }
  }

  protected override getBeatmapTrack(): Track | null {
    if (!this.metadata?.audioFile)
      return null;

    if (this.metadata.audioFile === virtual_track_filename)
      return null;

    try {
      const fileStorePath = this.beatmapSetInfo.getPathForFile(this.metadata.audioFile);

      // TrackStore.Get returns null for a missing file; here the set's file list answers that, and the data loads in the background.
      const track = fileStorePath === null ? null : this.resources.tracks.getSync(fileStorePath);

      if (track === null) {
        Logger.log(`Beatmap failed to load (file ${this.metadata.audioFile} not found on disk at expected location ${fileStorePath}).`, LoggingTarget.Runtime, LogLevel.Error);
        return null;
      }

      return track;
    } catch (e) {
      Logger.error(e, 'Track failed to load');
      return null;
    }
  }

  override getStream(storagePath: string): Promise<Uint8Array | null> {
    return this.resources.files.getBytes(storagePath);
  }
}
