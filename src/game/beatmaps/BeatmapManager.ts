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

  /** Hide a beatmap difficulty. Will fail if all difficulties are about to be hidden. */
  hide(beatmapInfo: BeatmapInfo): Promise<boolean> {
    return this.realm.write(r => {
      const set = r.all().find(s => s.beatmaps.some(b => b.id === beatmapInfo.id));
      if (set === undefined || set.beatmaps.filter(b => !b.hidden).length <= 1)
        return false;

      r.edit(set).beatmaps.find(b => b.id === beatmapInfo.id)!.hidden = true;
      return true;
    });
  }

  canHide(beatmapInfo: BeatmapInfo): boolean {
    const beatmap = this.realm.findBeatmap(beatmapInfo.id) ?? beatmapInfo;
    return beatmap.beatmapSet!.beatmaps.filter(b => !b.hidden).length > 1;
  }

  /** Restore a beatmap set (C#'s Restore(BeatmapSetInfo); restoring a single difficulty isn't used by ported code). */
  restore(beatmapSetInfo: BeatmapSetInfo): Promise<void> {
    return this.realm.write(r => {
      const set = r.find(beatmapSetInfo.id);
      if (set === null || !set.beatmaps.some(b => b.hidden))
        return;

      for (const beatmapInfo of r.edit(set).beatmaps.filter(b => b.hidden))
        beatmapInfo.hidden = false;
    });
  }

  markPlayed(beatmapInfo: BeatmapInfo): Promise<void> {
    return this.editBeatmap(beatmapInfo, b => b.lastPlayed = new Date());
  }

  markNotPlayed(beatmapInfo: BeatmapInfo): Promise<void> {
    return this.editBeatmap(beatmapInfo, b => b.lastPlayed = null);
  }

  /** r.Find<BeatmapInfo>(id) inside a write: edits the difficulty's set copy. */
  private editBeatmap(beatmapInfo: BeatmapInfo, perform: (b: BeatmapInfo) => void): Promise<void> {
    return this.realm.write(r => {
      const set = r.all().find(s => s.beatmaps.some(b => b.id === beatmapInfo.id));
      if (set !== undefined)
        perform(r.edit(set).beatmaps.find(b => b.id === beatmapInfo.id)!);
    });
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
