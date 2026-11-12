// Ported from osu.Game/Scoring/Legacy/ScoreInfoExtensions.cs: the display score. (The legacy hit count getters and setters, used by the
// legacy score encoder and decoder, are ported with replays.)

import { mathRound } from '@fw/utils/DotNet';
import { type HitResult, isBasic } from '../../rulesets/scoring/HitResult';
import { ScoreProcessor, ScoringMode } from '../../rulesets/scoring/ScoreProcessor';

/** The total score of a ScoreProcessor as the user's scoring display mode shows it. */
export function getDisplayScore(scoreProcessor: ScoreProcessor, mode: ScoringMode): number {
  return displayScore(scoreProcessor.ruleset.rulesetInfo.onlineID, scoreProcessor.totalScore.value, mode, scoreProcessor.maximumStatistics);
}

/** getDisplayScore for a stored score: its ruleset's online ID, total score and maximum statistics. */
export function displayScore(rulesetId: number, score: number, mode: ScoringMode, maximumStatistics: ReadonlyMap<HitResult, number>): number {
  if (mode === ScoringMode.Standardised)
    return score;

  let maxBasicJudgements = 0;

  for (const [result, count] of maximumStatistics) {
    if (isBasic(result))
      maxBasicJudgements += count;
  }

  return convertStandardisedToClassic(rulesetId, score, maxBasicJudgements);
}

/** Converts from standardised scoring to classic scoring. */
function convertStandardisedToClassic(rulesetId: number, standardisedTotalScore: number, objectCount: number): number {
  switch (rulesetId) {
    case 0:
      return mathRound((Math.pow(objectCount, 2) * 32.57 + 100000) * standardisedTotalScore / ScoreProcessor.MAX_SCORE);

    case 1:
      return mathRound((objectCount * 1109 + 100000) * standardisedTotalScore / ScoreProcessor.MAX_SCORE);

    case 2:
      return mathRound(Math.pow(standardisedTotalScore / ScoreProcessor.MAX_SCORE * objectCount, 2) * 21.62 + standardisedTotalScore / 10);

    case 3:
    default:
      return standardisedTotalScore;
  }
}
