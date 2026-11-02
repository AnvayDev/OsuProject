// Ported from osu.Game/Database/RealmFileStore.cs. Files live in the IndexedDB 'files' store keyed by their SHA-256 hash (C#'s storage path
// "a/ab/abcd…" becomes the bare hash), as ArrayBuffers. The existing-file re-hash check (corruption repair) is not reproduced: a present key
// is trusted, a missing one is written again.
// Web addition: playable conversions of stored videos (VideoTranscoder) are kept in 'convertedVideos' under their source file's hash, and
// are deleted along with it.

import { computeSHA2Hash } from '@fw/extensions/ExtensionMethods';
import type { IResourceStore } from '@fw/io/ResourceStore';
import { Logger, LoggingTarget } from '@fw/logging/Logger';
import { RealmFile } from '../models/RealmFile';
import type { RealmAccess } from './RealmAccess';

/** Handles the storing of files to the file system (and database) backing. */
export class RealmFileStore {
  /** C#'s Store (an IResourceStore<byte[]> over the storage), here resolving file hashes to Blobs. */
  readonly store: IResourceStore<Blob>;

  constructor(private readonly realm: RealmAccess) {
    this.store = {
      get: async hash => {
        const data = await this.getBytes(hash);
        return data === null ? null : new Blob([data as Uint8Array<ArrayBuffer>]);
      },
      getAvailableResources: () => [],
    };
  }

  /** Add a new file to the game-wide database, copying it to permanent storage if not already present. */
  async add(data: Uint8Array): Promise<RealmFile> {
    const hash = await computeSHA2Hash(data);

    const tx = this.realm.db.transaction('files', 'readwrite');

    if (await tx.store.getKey(hash) === undefined)
      await tx.store.put(data.slice().buffer, hash);

    await tx.done;

    return new RealmFile(hash);
  }

  /** The content of a stored file, or null if the store doesn't have it. */
  async getBytes(hash: string): Promise<Uint8Array | null> {
    const data = await this.realm.db.get('files', hash);
    return data === undefined ? null : new Uint8Array(data);
  }

  /** Web addition: the stored playable conversion of a video file, or null if it hasn't been converted. */
  async getConvertedVideo(hash: string): Promise<Uint8Array | null> {
    const data = await this.realm.db.get('convertedVideos', hash);
    return data === undefined ? null : new Uint8Array(data);
  }

  /** Web addition: stores a video file's playable conversion, unless the file itself is no longer stored. */
  async addConvertedVideo(hash: string, data: Uint8Array): Promise<void> {
    const tx = this.realm.db.transaction(['files', 'convertedVideos'], 'readwrite');

    if (await tx.objectStore('files').getKey(hash) !== undefined)
      await tx.objectStore('convertedVideos').put(data.slice().buffer, hash);

    await tx.done;
  }

  async exists(hash: string): Promise<boolean> {
    return await this.realm.db.getKey('files', hash) !== undefined;
  }

  /** Delete every stored file that no beatmap set uses (C#: RealmFiles with no usages). */
  async cleanup(): Promise<void> {
    Logger.log('Beginning realm file store cleanup');

    const used = new Set(this.realm.allBeatmapSets().flatMap(s => s.files.map(f => f.file.hash)));

    let totalFiles = 0;
    let removedFiles = 0;

    const tx = this.realm.db.transaction(['files', 'convertedVideos'], 'readwrite');
    const files = tx.objectStore('files');

    for (const hash of await files.getAllKeys()) {
      if (used.has(hash))
        continue;

      totalFiles++;

      try {
        removedFiles++;
        await files.delete(hash);
      } catch (e) {
        Logger.error(e, `Could not delete databased file ${hash}`, LoggingTarget.Database);
      }
    }

    // (conversions of videos that are no longer stored)
    const convertedVideos = tx.objectStore('convertedVideos');

    for (const hash of await convertedVideos.getAllKeys()) {
      if (!used.has(hash))
        await convertedVideos.delete(hash);
    }

    await tx.done;

    Logger.log(`Finished realm file store cleanup (${removedFiles} of ${totalFiles} deleted)`);
  }
}
