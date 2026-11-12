// Ported from osu.Game.Rulesets.Osu/Objects/SpinnerBonusTick.cs

import type { Judgement } from '../../judgements/Judgement';
import { HitResult } from '../../scoring/HitResult';
import { OsuSpinnerTickJudgement, SpinnerTick } from './SpinnerTick';

export class OsuSpinnerBonusTickJudgement extends OsuSpinnerTickJudgement {
  override get maxResult(): HitResult {
    return HitResult.LargeBonus;
  }
}

export class SpinnerBonusTick extends SpinnerTick {
  override createJudgement(): Judgement {
    return new OsuSpinnerBonusTickJudgement();
  }
}
