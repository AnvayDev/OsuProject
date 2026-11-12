// Ported from osu.Game.Rulesets.Osu/Objects/SpinnerTick.cs

import type { Judgement } from '../../judgements/Judgement';
import { HitResult } from '../../scoring/HitResult';
import { HitWindows } from '../../scoring/HitWindows';
import { OsuJudgement } from '../judgements/OsuJudgement';
import { OsuHitObject } from './OsuHitObject';

export class OsuSpinnerTickJudgement extends OsuJudgement {
  override get maxResult(): HitResult {
    return HitResult.SmallBonus;
  }
}

export class SpinnerTick extends OsuHitObject {
  /** Duration of the Spinner containing this spinner tick. */
  spinnerDuration = 0;

  override createJudgement(): Judgement {
    return new OsuSpinnerTickJudgement();
  }

  protected override createHitWindows(): HitWindows | null {
    return HitWindows.Empty;
  }

  override get maximumJudgementOffset(): number {
    return this.spinnerDuration;
  }
}
