// Ported from osu.Game.Rulesets.Osu/Objects/HitCircle.cs

import type { Judgement } from '../../judgements/Judgement';
import { OsuJudgement } from '../judgements/OsuJudgement';
import { OsuHitObject } from './OsuHitObject';

export class HitCircle extends OsuHitObject {
  override createJudgement(): Judgement {
    return new OsuJudgement();
  }
}
