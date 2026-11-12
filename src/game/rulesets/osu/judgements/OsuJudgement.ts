// Ported from osu.Game.Rulesets.Osu/Judgements/OsuJudgement.cs, OsuIgnoreJudgement.cs and SliderTickJudgement.cs

import { Judgement } from '../../judgements/Judgement';
import { HitResult } from '../../scoring/HitResult';

export class OsuJudgement extends Judgement {
  override get maxResult(): HitResult {
    return HitResult.Great;
  }
}

export class OsuIgnoreJudgement extends OsuJudgement {
  override get maxResult(): HitResult {
    return HitResult.IgnoreHit;
  }
}

export class SliderTickJudgement extends OsuJudgement {
  override get maxResult(): HitResult {
    return HitResult.LargeTickHit;
  }
}
