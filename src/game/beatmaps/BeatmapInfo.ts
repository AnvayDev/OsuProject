// Ported from osu.Game/Beatmaps/BeatmapInfo.cs (scores, collections and the realm-only members are omitted).

import { RulesetInfo } from '../rulesets/RulesetInfo';
import type { RealmNamedFileUsage } from '../models/RealmFile';
import { BeatmapDifficulty } from './BeatmapDifficulty';
import { BeatmapMetadata } from './BeatmapMetadata';
import { BeatmapOnlineStatus } from './BeatmapOnlineStatus';
import type { BeatmapSetInfo } from './BeatmapSetInfo';
import { BeatmapUserSettings } from './BeatmapUserSettings';

/** A realm model containing metadata for a single beatmap difficulty. This should generally include anything which is required to be filtered on at song select, or anything pertaining to storage of beatmaps in the client. */
export class BeatmapInfo {
  id: string;

  difficultyName = '';

  ruleset: RulesetInfo;

  difficulty: BeatmapDifficulty;

  metadata: BeatmapMetadata;

  userSettings: BeatmapUserSettings;

  constructor(ruleset: RulesetInfo | null = null, difficulty: BeatmapDifficulty | null = null, metadata: BeatmapMetadata | null = null) {
    this.id = crypto.randomUUID();
    this.ruleset = ruleset ?? Object.assign(new RulesetInfo(), { onlineID: 0, shortName: 'osu', name: 'null placeholder ruleset' });
    this.difficulty = difficulty ?? new BeatmapDifficulty();
    this.metadata = metadata ?? new BeatmapMetadata();
    this.userSettings = new BeatmapUserSettings();
  }

  beatmapSet: BeatmapSetInfo | null = null;

  /** The file usage of this difficulty's .osu file within its set. */
  get file(): RealmNamedFileUsage | null {
    return this.beatmapSet?.files.find(f => f.file.hash === this.hash) ?? null;
  }

  status = BeatmapOnlineStatus.None;

  onlineID = -1;

  length = 0;

  bpm = 0;

  hash = '';

  /** Defaults to -1 (meaning not-yet-calculated). Will likely be superseded with a better storage considering ruleset/mods. */
  starRating = -1;

  md5Hash = '';

  onlineMD5Hash = '';

  /** The last time of a local modification (via the editor). */
  lastLocalUpdate: Date | null = null;

  /** The last time online metadata was applied to this beatmap. */
  lastOnlineUpdate: Date | null = null;

  /** Whether this beatmap matches the online version, based on fetched online metadata. Will return true if no online metadata is available. */
  get matchesOnlineVersion(): boolean {
    return this.lastOnlineUpdate === null || this.md5Hash === this.onlineMD5Hash;
  }

  hidden = false;

  /** The number of hitobjects in the beatmap with a distinct end time. Canonically, these are hitobjects which are either sliders or spinners. */
  endTimeObjectCount = -1;

  /** The total number of hitobjects in the beatmap. */
  totalObjectCount = -1;

  /** Reset any fetched online linking information (and history). */
  resetOnlineInfo(resetOnlineId = true): void {
    if (resetOnlineId)
      this.onlineID = -1;

    this.lastOnlineUpdate = null;
    this.onlineMD5Hash = '';
    if (this.status !== BeatmapOnlineStatus.LocallyModified)
      this.status = BeatmapOnlineStatus.None;
  }

  /** The last time this beatmap was played locally. */
  lastPlayed: Date | null = null;

  /** The ideal number of beat divisions to snap to in the editor. */
  beatDivisor = 4;

  /** The time in milliseconds when last exiting the editor with this beatmap loaded. */
  editorTimestamp: number | null = null;

  equals(other: BeatmapInfo | null): boolean {
    if (this === other) return true;
    if (other === null) return false;

    return this.id === other.id;
  }

  /** The filename of this difficulty's .osu file. */
  get path(): string | null {
    return this.file?.filename ?? null;
  }

  toString(): string {
    return `${this.metadata} [${this.difficultyName}]`;
  }
}
