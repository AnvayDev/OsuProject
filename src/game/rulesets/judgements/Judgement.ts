// Ported from osu.Game/Rulesets/Judgements/Judgement.cs and IgnoreJudgement.cs

import { HitResult } from '../scoring/HitResult';
import type { JudgementResult } from './JudgementResult';

/** The scoring information provided by a HitObject. */
export class Judgement {
  /** The default health increase for a maximum judgement, as a proportion of total health. By default, each maximum judgement restores 5% of total health. */
  protected static readonly DEFAULT_MAX_HEALTH_INCREASE = 0.05;

  /** The maximum HitResult that can be achieved. */
  get maxResult(): HitResult {
    return HitResult.Perfect;
  }

  /** The minimum HitResult that can be achieved - the inverse of maxResult. */
  get minResult(): HitResult {
    switch (this.maxResult) {
      case HitResult.SmallBonus:
      case HitResult.LargeBonus:
      case HitResult.IgnoreHit:
        return HitResult.IgnoreMiss;

      case HitResult.SmallTickHit:
        return HitResult.SmallTickMiss;

      case HitResult.LargeTickHit:
        return HitResult.LargeTickMiss;

      case HitResult.SliderTailHit:
        return HitResult.IgnoreMiss;

      default:
        return HitResult.Miss;
    }
  }

  /** The health increase for the maximum achievable result. */
  get maxHealthIncrease(): number {
    return this.healthIncreaseFor(this.maxResult);
  }

  /** Retrieves the numeric health increase of a HitResult. */
  protected healthIncreaseFor(result: HitResult): number {
    const max = Judgement.DEFAULT_MAX_HEALTH_INCREASE;

    switch (result) {
      default:
        return 0;

      case HitResult.SmallTickHit:
        return max * 0.5;

      case HitResult.SmallTickMiss:
        return -max * 0.5;

      case HitResult.SliderTailHit:
      case HitResult.LargeTickHit:
        return max;

      case HitResult.LargeTickMiss:
        return -max;

      case HitResult.Miss:
        return -max * 2;

      case HitResult.Meh:
        return max * 0.05;

      case HitResult.Ok:
        return max * 0.5;

      case HitResult.Good:
        return max * 0.75;

      case HitResult.Great:
        return max;

      case HitResult.Perfect:
        return max * 1.05;

      case HitResult.SmallBonus:
        return max * 0.5;

      case HitResult.LargeBonus:
        return max;
    }
  }

  /** Retrieves the numeric health increase of a JudgementResult. */
  healthIncreaseForResult(result: JudgementResult): number {
    return this.healthIncreaseFor(result.type);
  }

  toString(): string {
    return `MaxResult:${HitResult[this.maxResult]}`;
  }
}

export class IgnoreJudgement extends Judgement {
  override get maxResult(): HitResult {
    return HitResult.IgnoreHit;
  }
}
