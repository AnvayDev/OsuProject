// Ported from osu.Game.Rulesets.Osu/Scoring/OsuHealthProcessor.cs

import { BeatmapDifficultyInfo } from '../../../beatmaps/BeatmapDifficulty';
import type { JudgementResult } from '../../judgements/JudgementResult';
import { hasComboInformation } from '../../objects/types/Types';
import { DrainingHealthProcessor } from '../../scoring/DrainingHealthProcessor';
import { HitResult, isHit } from '../../scoring/HitResult';
import { ComboResult } from '../judgements/OsuJudgementResult';
import { SliderHeadCircle } from '../objects/SliderHeadCircle';
import { SliderRepeat } from '../objects/SliderRepeat';
import { SliderTailCircle } from '../objects/SliderTailCircle';
import { SliderTick } from '../objects/SliderTick';

export class OsuHealthProcessor extends DrainingHealthProcessor {
  private currentComboResult = ComboResult.Perfect;

  protected override getHealthIncreaseFor(result: JudgementResult): number {
    if (this.isSimulating)
      return this.healthIncreaseFor(result);

    const combo = result.hitObject;

    if (!hasComboInformation(combo))
      return this.healthIncreaseFor(result);

    if (combo.newCombo)
      this.currentComboResult = ComboResult.Perfect;

    const setComboResult = (comboResult: ComboResult) => this.currentComboResult = Math.min(this.currentComboResult, comboResult);

    switch (result.type) {
      case HitResult.LargeTickMiss:
      case HitResult.Ok:
        setComboResult(ComboResult.Good);
        break;

      case HitResult.Meh:
      case HitResult.Miss:
        setComboResult(ComboResult.None);
        break;
    }

    // The slider tail has a special judgement that can't accurately be described above.
    if (result.hitObject instanceof SliderTailCircle && !result.isHit)
      setComboResult(ComboResult.Good);

    if (combo.lastInCombo && isHit(result.type)) {
      switch (this.currentComboResult) {
        case ComboResult.Perfect:
          return this.healthIncreaseFor(result) + 0.07;

        case ComboResult.Good:
          return this.healthIncreaseFor(result) + 0.05;

        default:
          return this.healthIncreaseFor(result) + 0.03;
      }
    }

    return this.healthIncreaseFor(result);
  }

  protected override reset(storeResults: boolean): void {
    super.reset(storeResults);
    this.currentComboResult = ComboResult.Perfect;
  }

  /** (the private getHealthIncreaseFor overload of C#) */
  private healthIncreaseFor(result: JudgementResult): number {
    const drainRate = this.beatmap.difficulty.drainRate;

    switch (result.type) {
      case HitResult.SmallTickMiss:
        return BeatmapDifficultyInfo.difficultyRange(drainRate, -0.02, -0.075, -0.14);

      case HitResult.LargeTickMiss:
        return BeatmapDifficultyInfo.difficultyRange(drainRate, -0.02, -0.075, -0.14);

      case HitResult.Miss:
        return BeatmapDifficultyInfo.difficultyRange(drainRate, -0.03, -0.125, -0.2);

      case HitResult.SmallTickHit:
        // When classic slider mechanics are enabled, this result comes from the tail.
        return 0.02;

      case HitResult.SliderTailHit:
      case HitResult.LargeTickHit:
        if (result.hitObject instanceof SliderTick)
          return 0.015;

        if (result.hitObject instanceof SliderHeadCircle || result.hitObject instanceof SliderTailCircle || result.hitObject instanceof SliderRepeat)
          return 0.02;

        break;

      case HitResult.Meh:
        return 0.002;

      case HitResult.Ok:
        return 0.011;

      case HitResult.Great:
        return 0.03;

      case HitResult.SmallBonus:
        return 0.0085;

      case HitResult.LargeBonus:
        return 0.01;
    }

    return super.getHealthIncreaseFor(result);
  }
}
