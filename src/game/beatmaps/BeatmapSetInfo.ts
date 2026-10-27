// Ported from osu.Game/Beatmaps/BeatmapSetInfo.cs and BeatmapSetInfoExtensions.GetFile/GetPathForFile.

import type { RealmNamedFileUsage } from '../models/RealmFile';
import type { BeatmapInfo } from './BeatmapInfo';
import { BeatmapMetadata } from './BeatmapMetadata';
import { getDisplayTitle } from './BeatmapMetadataInfoExtensions';
import { BeatmapOnlineStatus } from './BeatmapOnlineStatus';

export class BeatmapSetInfo {
  id: string;

  onlineID = -1;

  dateAdded = new Date(0);

  /** The date this beatmap set was first submitted. */
  dateSubmitted: Date | null = null;

  /** The date this beatmap set was ranked. */
  dateRanked: Date | null = null;

  get metadata(): BeatmapMetadata {
    return this.beatmaps[0]?.metadata ?? new BeatmapMetadata();
  }

  readonly beatmaps: BeatmapInfo[] = [];

  readonly files: RealmNamedFileUsage[] = [];

  status = BeatmapOnlineStatus.None;

  deletePending = false;

  hash = '';

  /** C# `Protected`: whether deleting this beatmap set should be prohibited (due to it being a system requirement to be present). */
  isProtected = false;

  get maxStarDifficulty(): number {
    return this.beatmaps.length === 0 ? 0 : Math.max(...this.beatmaps.map(b => b.starRating));
  }

  get maxLength(): number {
    return this.beatmaps.length === 0 ? 0 : Math.max(...this.beatmaps.map(b => b.length));
  }

  get maxBPM(): number {
    return this.beatmaps.length === 0 ? 0 : Math.max(...this.beatmaps.map(b => b.bpm));
  }

  constructor(beatmaps: Iterable<BeatmapInfo> | null = null) {
    this.id = crypto.randomUUID();

    if (beatmaps !== null)
      this.beatmaps.push(...beatmaps);
  }

  equals(other: BeatmapSetInfo | null): boolean {
    if (this === other) return true;
    if (other === null) return false;

    return this.id === other.id;
  }

  get allBeatmapsUpToDate(): boolean {
    return this.beatmaps.every(b => b.matchesOnlineVersion);
  }

  /** BeatmapSetInfoExtensions.GetFile: the file usage for a filename (case-insensitive). */
  getFile(filename: string): RealmNamedFileUsage | null {
    const lower = filename.toLowerCase();
    const matches = this.files.filter(f => f.filename.toLowerCase() === lower);

    if (matches.length > 1)
      throw new Error('Sequence contains more than one matching element');

    return matches[0] ?? null;
  }

  /**
   * BeatmapSetInfoExtensions.GetPathForFile: the storage path for the file in this beatmapset with the given filename, if any exists,
   * otherwise null. The lookup is case insensitive. The storage path is the file's hash: the IndexedDB file store is keyed by it.
   */
  getPathForFile(filename: string): string | null {
    return this.getFile(filename)?.file.hash ?? null;
  }

  toString(): string {
    return getDisplayTitle(this.metadata);
  }
}
