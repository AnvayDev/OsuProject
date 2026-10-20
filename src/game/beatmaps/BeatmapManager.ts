// Ported from osu.Game/Beatmaps/BeatmapManager.cs (importing, deleting, querying and working beatmaps; editor, export and maintenance members
// are not ported). C# overloads have distinct names: Import(ImportTask[]) is import(), Import(notification, tasks) importWithNotification(),
// Import(ImportTask) importTask(); Delete(filter) is deleteAll().

import type { AudioManager } from '@fw/audio/AudioManager';
import type { TrackStore } from '@fw/audio/track/TrackStore';
import type { ImportParameters } from '../database/ImportParameters';
import type { ImportTask } from '../database/ImportTask';
import { ModelManager } from '../database/ModelManager';
import type { RealmAccess } from '../database/RealmAccess';
import type { ProgressNotification } from '../overlays/notifications/ProgressNotification';
import { BeatmapImporter, type ProcessBeatmapDelegate } from './BeatmapImporter';
import type { BeatmapInfo } from './BeatmapInfo';
import type { BeatmapSetInfo } from './BeatmapSetInfo';
import type { WorkingBeatmap } from './WorkingBeatmap';
import { type IWorkingBeatmapCache, WorkingBeatmapCache } from './WorkingBeatmapCache';

/** Handles general operations related to global beatmap management. */
export class BeatmapManager extends ModelManager implements IWorkingBeatmapCache {
  readonly beatmapTrackStore: TrackStore;

  private readonly beatmapImporter: BeatmapImporter;

  private readonly workingBeatmapCache: WorkingBeatmapCache;

  processBeatmap: ProcessBeatmapDelegate | null = null;

  constructor(realm: RealmAccess, audioManager: AudioManager, defaultBeatmap: WorkingBeatmap) {
    super(realm);

    this.beatmapTrackStore = audioManager.getTrackStore(realm.files.store);

    this.beatmapImporter = new BeatmapImporter(realm);
    this.beatmapImporter.processBeatmap = (beatmapSet, scope) => this.processBeatmap?.(beatmapSet, scope) ?? Promise.resolve();
    this.beatmapImporter.postNotification = obj => this.postNotification?.(obj);

    this.workingBeatmapCache = new WorkingBeatmapCache(this.beatmapTrackStore, audioManager, realm.files, defaultBeatmap);
  }

  /** Returns a list of all usable BeatmapSetInfos (not pending deletion; protected sets included). Note that files are included. */
  getAllUsableBeatmapSets(): BeatmapSetInfo[] {
    return this.realm.allBeatmapSets().filter(b => !b.deletePending);
  }

  /** Perform a lookup query on available BeatmapSetInfos (all of them: no deletePending or protected filter). */
  queryBeatmapSet(query: (s: BeatmapSetInfo) => boolean): BeatmapSetInfo | null {
    return this.realm.allBeatmapSets().find(query) ?? null;
  }

  /** A default representation of a WorkingBeatmap. */
  get defaultBeatmap(): WorkingBeatmap {
    return this.workingBeatmapCache.defaultBeatmap;
  }

  /** Delete all beatmap sets matching the filter (all of them by default), excluding protected sets. */
  deleteAll(filter: ((s: BeatmapSetInfo) => boolean) | null = null, silent = false): Promise<void> {
    let items = this.realm.allBeatmapSets().filter(s => !s.deletePending && !s.isProtected);

    if (filter !== null)
      items = items.filter(filter);

    return this.deleteItems(items, silent);
  }

  undeleteAll(): Promise<void> {
    return this.undeleteItems(this.realm.allBeatmapSets().filter(s => s.deletePending));
  }

  /** Set (persist) the protected flag, or any other change, on a stored set: C#'s Live<BeatmapSetInfo>.PerformWrite. */
  performWrite(beatmapSet: BeatmapSetInfo, perform: (s: BeatmapSetInfo) => void): Promise<void> {
    return this.realm.write(realm => {
      const s = realm.find(beatmapSet.id);
      if (s !== null)
        perform(realm.edit(s));
    });
  }

  // #region Implementation of ICanAcceptFiles

  import(tasks: ImportTask[], parameters: ImportParameters = {}): Promise<BeatmapSetInfo[]> {
    return this.beatmapImporter.import(tasks, parameters);
  }

  importWithNotification(notification: ProgressNotification, tasks: ImportTask[], parameters: ImportParameters = {}): Promise<BeatmapSetInfo[]> {
    return this.beatmapImporter.importWithNotification(notification, tasks, parameters);
  }

  importTask(task: ImportTask, parameters: ImportParameters = {}, cancellationToken?: AbortSignal): Promise<BeatmapSetInfo | null> {
    return this.beatmapImporter.importTask(task, parameters, cancellationToken);
  }

  get handledExtensions(): readonly string[] {
    return this.beatmapImporter.handledExtensions;
  }

  // #endregion

  // #region Implementation of IWorkingBeatmapCache

  /** Retrieve a WorkingBeatmap instance for the provided BeatmapInfo. refetch: whether to refetch the latest stored BeatmapInfo first. */
  getWorkingBeatmap(beatmapInfo: BeatmapInfo | null, refetch = false): WorkingBeatmap {
    if (beatmapInfo !== null) {
      if (refetch)
        this.workingBeatmapCache.invalidate(beatmapInfo);

      // Detached beatmapsets don't come with files as an optimisation (see `RealmObjectExtensions.beatmap_set_mapper`).
      // If we seem to be missing files, now is a good time to re-fetch.
      const missingFiles = beatmapInfo.beatmapSet?.files.length === 0;

      if (refetch || missingFiles)
        beatmapInfo = this.realm.findBeatmap(beatmapInfo.id) ?? beatmapInfo;
    }

    return this.workingBeatmapCache.getWorkingBeatmap(beatmapInfo);
  }

  invalidate(info: BeatmapSetInfo | BeatmapInfo): void {
    this.workingBeatmapCache.invalidate(info);
  }

  // #endregion

  // #region Implementation of IPostImports<out BeatmapSetInfo>

  set presentImport(value: ((imported: BeatmapSetInfo[]) => void) | null) {
    this.beatmapImporter.presentImport = value;
  }

  // #endregion

  override get humanisedModelName(): string {
    return 'beatmap';
  }
}
