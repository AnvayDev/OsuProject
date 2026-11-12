// Ported from osu.Game.Rulesets.Osu/Objects/SliderTailCircle.cs

import type { Judgement } from '../../judgements/Judgement';
import { HitResult } from '../../scoring/HitResult';
import { OsuJudgement } from '../judgements/OsuJudgement';
import type { Slider } from './Slider';
import { SliderEndCircle, SliderEndJudgement } from './SliderEndCircle';

export class LegacyTailJudgement extends OsuJudgement {
  override get maxResult(): HitResult {
    return HitResult.SmallTickHit;
  }
}

export class TailJudgement extends SliderEndJudgement {
  override get maxResult(): HitResult {
    return HitResult.SliderTailHit;
  }
}

export class SliderTailCircle extends SliderEndCircle {
  /**
   * Whether to treat this SliderTailCircle as a normal HitCircle for judgement purposes.
   * If false, this SliderTailCircle will be judged as a SliderTick instead.
   */
  classicSliderBehaviour = false;

  constructor(slider: Slider) {
    super(slider);
  }

  override createJudgement(): Judgement {
    return this.classicSliderBehaviour ? new LegacyTailJudgement() : new TailJudgement();
  }
}
