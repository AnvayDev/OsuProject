// Ported from osu.Game.Rulesets.Osu/Scoring/OsuScoreProcessor.cs

import { ScoreRank } from '../../../scoring/ScoreRank';
import type { JudgementResult } from '../../judgements/JudgementResult';
import type { HitEvent } from '../../scoring/HitEvent';
import { HitResult } from '../../scoring/HitResult';
import { ScoreProcessor } from '../../scoring/ScoreProcessor';
import { OsuHitCircleJudgementResult } from '../judgements/OsuJudgementResult';
import { OsuRuleset } from '../OsuRuleset';

export class OsuScoreProcessor extends ScoreProcessor {
  constructor() {
    super(new OsuRuleset());
  }

  override rankFromScore(accuracy: number, results: ReadonlyMap<HitResult, number>): ScoreRank {
    let rank = super.rankFromScore(accuracy, results);

    switch (rank) {
      case ScoreRank.S:
      case ScoreRank.X:
        if ((results.get(HitResult.Miss) ?? 0) > 0)
          rank = ScoreRank.A;
        break;
    }

    return rank;
  }

  protected override createHitEvent(result: JudgementResult): HitEvent {
    return super.createHitEvent(result).with(result instanceof OsuHitCircleJudgementResult ? result.cursorPositionAtHit : null);
  }
}
