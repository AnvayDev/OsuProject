// Ported from osu.Game.Rulesets.Osu/Objects/SliderHeadCircle.cs

import type { Judgement } from '../../judgements/Judgement';
import { SliderTickJudgement } from '../judgements/OsuJudgement';
import { HitCircle } from './HitCircle';

export class SliderHeadCircle extends HitCircle {
  /**
   * Whether to treat this SliderHeadCircle as a normal HitCircle for judgement purposes.
   * If false, this SliderHeadCircle will be judged as a SliderTick instead.
   */
  classicSliderBehaviour = false;

  override createJudgement(): Judgement {
    return this.classicSliderBehaviour ? new SliderTickJudgement() : super.createJudgement();
  }
}
