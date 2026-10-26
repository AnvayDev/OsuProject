// Ported from osu.Game/Online/API/Requests/Responses/APIBeatmap.cs (the members used so far), with the JSON mapping of its [JsonProperty]s.

import { BeatmapOnlineStatus } from '../../../../beatmaps/BeatmapOnlineStatus';
import { type RulesetInfo, RulesetStore } from '../../../../rulesets/RulesetInfo';
import type { APIBeatmapSet } from './APIBeatmapSet';

/** osu-web's ranked status names (BeatmapOnlineStatus's JSON form). */
const statuses: Record<string, BeatmapOnlineStatus> = {
  graveyard: BeatmapOnlineStatus.Graveyard,
  wip: BeatmapOnlineStatus.WIP,
  pending: BeatmapOnlineStatus.Pending,
  ranked: BeatmapOnlineStatus.Ranked,
  approved: BeatmapOnlineStatus.Approved,
  qualified: BeatmapOnlineStatus.Qualified,
  loved: BeatmapOnlineStatus.Loved,
};

export const parseBeatmapOnlineStatus = (status: unknown): BeatmapOnlineStatus => statuses[String(status)] ?? BeatmapOnlineStatus.None;

export const parseDateTimeOffset = (date: unknown): Date | null => typeof date === 'string' ? new Date(date) : null;

/* eslint-disable @typescript-eslint/no-explicit-any */
export class APIBeatmap {
  onlineID = 0;

  onlineBeatmapSetID = 0;

  status = BeatmapOnlineStatus.None;

  checksum = '';

  authorID = 0;

  beatmapSet: APIBeatmapSet | null = null;

  playCount = 0;

  passCount = 0;

  rulesetID = 0;

  starRating = 0;

  drainRate = 0;

  circleSize = 0;

  approachRate = 0;

  overallDifficulty = 0;

  /** In milliseconds (total_length is in seconds). */
  length = 0;

  /** In milliseconds (hit_length is in seconds). */
  hitLength = 0;

  convert = false;

  circleCount = 0;

  sliderCount = 0;

  spinnerCount = 0;

  difficultyName = '';

  maxCombo: number | null = null;

  bpm = 0;

  get ruleset(): RulesetInfo {
    return RulesetStore.getRuleset(this.rulesetID)!;
  }

  static fromJson(json: any): APIBeatmap {
    const b = new APIBeatmap();

    b.onlineID = json.id ?? 0;
    b.onlineBeatmapSetID = json.beatmapset_id ?? 0;
    b.status = parseBeatmapOnlineStatus(json.status);
    b.checksum = json.checksum ?? '';
    b.authorID = json.user_id ?? 0;
    b.playCount = json.playcount ?? 0;
    b.passCount = json.passcount ?? 0;
    b.rulesetID = json.mode_int ?? 0;
    b.starRating = json.difficulty_rating ?? 0;
    b.drainRate = json.drain ?? 0;
    b.circleSize = json.cs ?? 0;
    b.approachRate = json.ar ?? 0;
    b.overallDifficulty = json.accuracy ?? 0;
    b.length = (json.total_length ?? 0) * 1000;
    b.hitLength = (json.hit_length ?? 0) * 1000;
    b.convert = json.convert ?? false;
    b.circleCount = json.count_circles ?? 0;
    b.sliderCount = json.count_sliders ?? 0;
    b.spinnerCount = json.count_spinners ?? 0;
    b.difficultyName = json.version ?? '';
    b.maxCombo = json.max_combo ?? null;
    b.bpm = json.bpm ?? 0;

    return b;
  }
}
