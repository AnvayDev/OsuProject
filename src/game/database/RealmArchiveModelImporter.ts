// Ported from osu.Game/Database/RealmArchiveModelImporter.cs. TModel = BeatmapSetInfo, the only realm model this port stores.
// Differences, all from the browser:
// - Tasks import one after another (C# creates models in parallel and runs ImportModel through a single-concurrency scheduler).
// - Hashing and file reads are asynchronous and an IndexedDB transaction can't stay open across them, so ImportModel does Populate and
//   PostImport (beatmap processing) before its write, then repeats the existing-model check inside the write. As in C#, a model only becomes
//   visible with its processed values, and a failure leaves no model behind (only its files, removed at the next startup).
// - Not ported: the batch fast path (≥10 tasks: skip archives whose hash and filenames already match), pausing imports during gameplay,
//   deleting the source file.

import { computeSHA2Hash, toStandardisedPath } from '@fw/extensions/ExtensionMethods';
import { getCommonPrefix } from '@fw/extensions/EnumerableExtensions';
import { Logger, LoggingTarget } from '@fw/logging/Logger';
import type { BeatmapSetInfo } from '../beatmaps/BeatmapSetInfo';
import type { ArchiveReader } from '../io/archives/ArchiveReader';
import { RealmNamedFileUsage } from '../models/RealmFile';
import type { Notification } from '../overlays/notifications/Notification';
import { ProgressNotification, ProgressNotificationState } from '../overlays/notifications/ProgressNotification';
import { FilesystemSanityCheckHelpers } from '../utils/FilesystemSanityCheckHelpers';
import type { ImportParameters } from './ImportParameters';
import type { ImportTask } from './ImportTask';
import type { RealmAccess, RealmWrite } from './RealmAccess';
import type { RealmFileStore } from './RealmFileStore';

/**
 * C#'s OrderBy(f => f.Filename) uses the culture-sensitive default comparer (ICU on the user's macOS client); Intl.Collator is the closest
 * match. Only the set hash of archives with several .osu files depends on it.
 */
const filenameComparer = new Intl.Collator('en-US').compare;

export abstract class RealmArchiveModelImporter {
  /** The minimum number of items in a single import call in order for the import to be processed as a batch. */
  private static readonly minimum_items_considered_batch_import = 10;

  abstract get handledExtensions(): readonly string[];

  protected readonly files: RealmFileStore;

  /** Fired when the user requests to view the resulting import. */
  presentImport: ((imported: BeatmapSetInfo[]) => void) | null = null;

  /** Set an endpoint for notifications to be posted to. */
  postNotification: ((notification: Notification) => void) | null = null;

  private importQueue: Promise<unknown> = Promise.resolve();

  protected constructor(protected readonly realm: RealmAccess) {
    this.files = realm.files;
  }

  /** C#'s Import(ImportTask[], ImportParameters): posts a progress notification and imports the tasks. */
  import(tasks: ImportTask[], parameters: ImportParameters = {}): Promise<BeatmapSetInfo[]> {
    const notification = new ProgressNotification();
    notification.state = ProgressNotificationState.Active;

    this.postNotification?.(notification);

    return this.importWithNotification(notification, tasks, parameters);
  }

  /** C#'s Import(ProgressNotification, ImportTask[], ImportParameters). */
  async importWithNotification(notification: ProgressNotification, tasks: ImportTask[], parameters: ImportParameters = {}): Promise<BeatmapSetInfo[]> {
    if (tasks.length === 0) {
      notification.completionText = `No ${this.humanisedModelName}s were found to import!`;
      notification.state = ProgressNotificationState.Completed;
      return [];
    }

    notification.progress = 0;

    let current = 0;

    const imported: BeatmapSetInfo[] = [];

    parameters = { ...parameters, batch: (parameters.batch ?? false) || tasks.length >= RealmArchiveModelImporter.minimum_items_considered_batch_import };

    notification.text = `${titleCase(this.humanisedModelName)} import is initialising...`;
    notification.state = ProgressNotificationState.Active;

    try {
      for (const task of tasks) {
        notification.cancellationToken.throwIfAborted();

        try {
          const model = await this.importTask(task, parameters, notification.cancellationToken);

          if (model !== null)
            imported.push(model);
          current++;

          notification.text = `Imported ${current} of ${tasks.length} ${this.humanisedModelName}s`;
          notification.progress = current / tasks.length;
        } catch (e) {
          if (notification.cancellationToken.aborted)
            throw e;

          Logger.error(e, `Could not import (${task})`, LoggingTarget.Database);
        }
      }
    } finally {
      if (imported.length === 0) {
        if (notification.cancellationToken.aborted) {
          notification.state = ProgressNotificationState.Cancelled;
        } else {
          notification.text = `${titleCase(this.humanisedModelName)} import failed! Check logs for more information.`;
          notification.state = ProgressNotificationState.Cancelled;
        }
      } else {
        if (tasks.length > imported.length)
          notification.completionText = `Imported ${imported.length} of ${tasks.length} ${this.humanisedModelName}s.`;
        else if (imported.length > 1)
          notification.completionText = `Imported ${imported.length} ${this.humanisedModelName}s!`;
        else
          notification.completionText = `Imported ${imported[0]}!`;

        if (imported.length > 0 && this.presentImport !== null) {
          notification.completionText += ' Click to view.';
          notification.completionClickAction = () => {
            this.presentImport?.(imported);
            return true;
          };
        }

        notification.state = ProgressNotificationState.Completed;
      }
    }

    return imported;
  }

  /** C#'s Import(ImportTask, ImportParameters, CancellationToken): import one task without a notification. Failures throw. */
  async importTask(task: ImportTask, parameters: ImportParameters = {}, cancellationToken?: AbortSignal): Promise<BeatmapSetInfo | null> {
    cancellationToken?.throwIfAborted();

    const reader = task.getReader();

    try {
      return await this.importFromArchive(reader, parameters, cancellationToken);
    } finally {
      reader.dispose();
    }
  }

  private async importFromArchive(archive: ArchiveReader, parameters: ImportParameters, cancellationToken?: AbortSignal): Promise<BeatmapSetInfo | null> {
    cancellationToken?.throwIfAborted();

    let model: BeatmapSetInfo | null = null;

    try {
      model = this.createModel(archive, parameters);

      if (model === null)
        return null;
    } catch (e) {
      RealmArchiveModelImporter.logForModel(model, `Model creation of ${archive.name} failed.`, e);
      return null;
    }

    return this.importModel(model, archive, parameters, cancellationToken);
  }

  /** Silently import an item from a BeatmapSetInfo. Imports run one at a time. */
  importModel(item: BeatmapSetInfo, archive: ArchiveReader | null = null, parameters: ImportParameters = {}, cancellationToken?: AbortSignal): Promise<BeatmapSetInfo> {
    const result = this.importQueue.then(() => this.performImportModel(item, archive, parameters, cancellationToken));
    this.importQueue = result.catch(() => {});
    return result;
  }

  private async performImportModel(item: BeatmapSetInfo, archive: ArchiveReader | null, parameters: ImportParameters, cancellationToken?: AbortSignal): Promise<BeatmapSetInfo> {
    try {
      // Log output here will be missing a valid hash in non-batch imports.
      RealmArchiveModelImporter.logForModel(item, `Beginning import from ${archive?.name ?? 'unknown'}...`);

      const files: RealmNamedFileUsage[] = [];

      if (archive !== null) {
        // Import files to the store.
        // Files are stored ahead of the model, so they can be cleaned up even if the import fails.
        for (const filenames of this.getShortenedFilenames(archive)) {
          if (FilesystemSanityCheckHelpers.incursPathTraversalRisk(filenames.shortened))
            throw new Error(`Filename "${filenames.original}" is not allowed.`);

          files.push(new RealmNamedFileUsage(await this.files.add(archive.getStream(filenames.original)!), filenames.shortened));
        }
      }

      item.files.push(...files);
      item.hash = await this.computeHash(item);

      await this.populate(item, archive, cancellationToken);

      // Checked once here so a reusable model isn't processed (C# only does this check inside the write, where it is repeated below).
      const reusable = this.checkForExisting(item, this.realm.allBeatmapSets());

      if (reusable === null || !this.canReuseExisting(reusable, item))
        await this.postImport(item, parameters);

      const existing = await this.realm.write(realm => {
        // Populate() may have adjusted file content (see SkinImporter.updateSkinIniMetadata), so regardless of whether a fast check was done earlier, let's
        // check for existing items a second time.
        const found = this.checkForExisting(item, realm.all());

        if (found !== null) {
          if (this.canReuseExisting(found, item)) {
            RealmArchiveModelImporter.logForModel(item, `Found existing ${this.humanisedModelName} for ${item} (ID ${found.id}) – skipping import.`);

            const reused = realm.edit(found);
            this.undeleteForReuse(reused);
            return reused;
          }

          RealmArchiveModelImporter.logForModel(item, 'Found existing but failed re-use check.');

          realm.edit(found).deletePending = true;
        }

        this.preImport(item, realm);

        // import to store
        realm.add(item);

        return null;
      });

      if (existing !== null)
        return this.realm.findBeatmapSet(existing.id) ?? existing;

      RealmArchiveModelImporter.logForModel(item, 'Import successfully completed!');
    } catch (e) {
      if (!cancellationToken?.aborted)
        RealmArchiveModelImporter.logForModel(item, 'Database import or population failed and has been rolled back.', e);

      throw e;
    }

    return item;
  }

  protected abstract get hashableFileTypes(): readonly string[];

  static logForModel(model: BeatmapSetInfo | null, message: string, e?: unknown): void {
    const trimmedHash = model === null || !model.hash ? '?????' : model.hash.substring(0, 5);

    const prefix = `[${trimmedHash}]`;

    if (e !== undefined)
      Logger.error(e, `${prefix} ${message}`, LoggingTarget.Database);
    else
      Logger.log(`${prefix} ${message}`, LoggingTarget.Database);
  }

  /** Create a SHA-2 hash from the provided archive based on file content of all files matching hashableFileTypes. */
  async computeHash(item: BeatmapSetInfo): Promise<string> {
    // for now, concatenate all hashable files in the set to create a unique hash.
    const hashable: Uint8Array[] = [];

    const files = item.files
      .filter(f => this.hashableFileTypes.some(ext => f.filename.toLowerCase().endsWith(ext.toLowerCase())))
      .sort((a, b) => filenameComparer(a.filename, b.filename));

    for (const file of files) {
      const s = await this.files.getBytes(file.file.hash);
      if (s !== null)
        hashable.push(s);
    }

    const length = hashable.reduce((sum, s) => sum + s.length, 0);

    if (length > 0) {
      const all = new Uint8Array(length);
      let offset = 0;
      for (const s of hashable) {
        all.set(s, offset);
        offset += s.length;
      }

      return computeSHA2Hash(all);
    }

    return item.hash;
  }

  private *getShortenedFilenames(reader: ArchiveReader): Generator<{ original: string; shortened: string }> {
    let prefix = getCommonPrefix(reader.filenames);
    if (!(prefix.endsWith('/') || prefix.endsWith('\\')))
      prefix = '';

    // filename lookups on models are case insensitive (see `BeatmapSetInfoExtensions.GetFile()`), but an
    // archive can contain both "audio.mp3" and "Audio.MP3". importing such a pair would result in a model which
    // throws on any file lookup or be unclear which file should be chosen should that be guarded
    const seenFilenames = new Set<string>();

    for (const file of reader.filenames) {
      const shortened = toStandardisedPath(file.substring(prefix.length));

      if (seenFilenames.has(shortened.toLowerCase()))
        throw new Error(`Multiple files with the name "${shortened}" (ignoring case) are present. Only one of them can be kept.`);

      seenFilenames.add(shortened.toLowerCase());

      yield { original: file, shortened };
    }
  }

  /** Create a barebones model from the provided archive. Actual expensive population should be done in populate; this should just prepare for duplicate checking. */
  protected abstract createModel(archive: ArchiveReader, parameters: ImportParameters): BeatmapSetInfo | null;

  /** Populate the provided model completely from the given archive. After this method, the model should be in a state ready to commit to a store. */
  protected abstract populate(model: BeatmapSetInfo, archive: ArchiveReader | null, cancellationToken?: AbortSignal): Promise<void>;

  /** Perform any final actions before the import to database executes. */
  protected preImport(_model: BeatmapSetInfo, _realm: RealmWrite): void {
  }

  /** Perform any final actions after the import has been committed to the database (here: before the write, see the header). */
  protected postImport(_model: BeatmapSetInfo, _parameters: ImportParameters): Promise<void> {
    return Promise.resolve();
  }

  /** Check whether an existing model already exists for a new import item. */
  protected checkForExisting(model: BeatmapSetInfo, all: readonly BeatmapSetInfo[]): BeatmapSetInfo | null {
    if (!model.hash)
      return null;

    // OrderBy(b => b.DeletePending) is stable: non-deleted models first, otherwise in storage order.
    return [...all.filter(b => !b.deletePending), ...all.filter(b => b.deletePending)].find(b => b.hash === model.hash) ?? null;
  }

  /**
   * After an existing model is found during an import process, the default behaviour is to use/restore the existing item and skip the
   * import. This provides a way to change that behaviour.
   */
  protected canReuseExisting(existing: BeatmapSetInfo, imported: BeatmapSetInfo): boolean {
    // for the best or worst, we copy and import files of a new import before checking whether
    // it is a duplicate. so to check if anything has changed, we can just compare all File IDs.
    return sequenceEqual(getIDs(existing.files), getIDs(imported.files))
      && sequenceEqual(getFilenames(existing.files), getFilenames(imported.files));
  }

  /** Called when an existing model is in a soft deleted state but being recovered. */
  protected undeleteForReuse(existing: BeatmapSetInfo): void {
    if (!existing.deletePending)
      return;

    RealmArchiveModelImporter.logForModel(existing, `Existing ${this.humanisedModelName}'s deletion flag has been removed to allow for reuse.`);
    existing.deletePending = false;
  }

  get humanisedModelName(): string {
    return 'beatmapset';
  }
}

function getIDs(files: readonly RealmNamedFileUsage[]): string[] {
  return [...files].sort((a, b) => filenameComparer(a.filename, b.filename)).map(f => f.file.hash);
}

function getFilenames(files: readonly RealmNamedFileUsage[]): string[] {
  return [...files].sort((a, b) => filenameComparer(a.filename, b.filename)).map(f => f.filename);
}

function sequenceEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Humanizer's Humanize(LetterCasing.Title) for a lower-case model name. */
export function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}
