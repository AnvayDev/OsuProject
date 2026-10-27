// Ported from osu.Game/Beatmaps/OnlineBeatmapMetadata.cs
// Web addition: starRating, the osu-web difficulty rating that stands in for the difficulty calculators (docs/spec/assets-formats.md §4).

import type { BeatmapOnlineStatus } from './BeatmapOnlineStatus';

/**
 * This structure contains parts of beatmap metadata which are involved with the online parts of the game, and therefore must be treated with
 * particular care. This data is retrieved from trusted sources (such as osu-web API, or a locally downloaded sqlite snapshot of osu-web metadata).
 */
export interface OnlineBeatmapMetadata {
  /** The online ID of the beatmap. */
  readonly beatmapID: number;
  /** The online ID of the beatmap set. */
  readonly beatmapSetID: number;
  /** The online ID of the author. */
  readonly authorID: number;
  /** The online status of the beatmap. */
  readonly beatmapStatus: BeatmapOnlineStatus;
  /** The online status of the associated beatmap set. */
  readonly beatmapSetStatus: BeatmapOnlineStatus | null;
  /** The rank date of the beatmap, if applicable and available. */
  readonly dateRanked: Date | null;
  /** The submission date of the beatmap, if available. */
  readonly dateSubmitted: Date | null;
  /** The MD5 hash of the beatmap. Used to verify integrity. */
  readonly md5Hash: string;
  /** The date when this metadata was last updated. */
  readonly lastUpdated: Date;
  /** The list of tags that users have assigned to this beatmap. */
  readonly userTags: string[];
  /** (web) The star rating osu-web computed for the beatmap in its own ruleset. */
  readonly starRating: number;
}
