// Ported from osu.Game/Scoring/ScoreInfo.cs: for now only the members ScoreProcessor fills in. The rest of the model (user, beatmap,
// ruleset, mods, date, replay file, online IDs, legacy fields) is ported with score storage.

import type { HitEvent } from '../rulesets/scoring/HitEvent';
import type { HitResult } from '../rulesets/scoring/HitResult';
import { ScoreRank } from './ScoreRank';

export class ScoreInfo {
  totalScore = 0;

  totalScoreWithoutMods = 0;

  /** The version of processing applied to calculate total score as stored in the database (LegacyScoreEncoder.LATEST_VERSION for new scores). */
  totalScoreVersion = 30000019;

  maxCombo = 0;

  accuracy = 0;

  /** The current combo (not persisted). */
  combo = 0;

  /** Whether this ScoreInfo represents a completed, passing play. */
  passed = true;

  rank = ScoreRank.F;

  statistics = new Map<HitResult, number>();

  maximumStatistics = new Map<HitResult, number>();

  /** A sequence of HitEvents describing the play. This list will be empty for scores which were not played in the current session. */
  hitEvents: readonly HitEvent[] = [];
}
