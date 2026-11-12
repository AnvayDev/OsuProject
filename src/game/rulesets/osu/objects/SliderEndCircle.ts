// Ported from osu.Game.Rulesets.Osu/Objects/SliderEndCircle.cs

import type { IBeatmapDifficultyInfo } from '../../../beatmaps/BeatmapDifficulty';
import type { ControlPointInfo } from '../../../beatmaps/controlPoints/ControlPointInfo';
import type { Judgement } from '../../judgements/Judgement';
import { HitResult } from '../../scoring/HitResult';
import { HitWindows } from '../../scoring/HitWindows';
import { OsuJudgement } from '../judgements/OsuJudgement';
import { HitCircle } from './HitCircle';
import type { Slider } from './Slider';

export class SliderEndJudgement extends OsuJudgement {
  override get maxResult(): HitResult {
    return HitResult.LargeTickHit;
  }
}

/** A hit circle which is at the end of a slider path (either repeat or final tail). */
export abstract class SliderEndCircle extends HitCircle {
  repeatIndex = 0;

  protected constructor(protected readonly slider: Slider) {
    super();
  }

  get spanDuration(): number {
    return this.slider.spanDuration;
  }

  protected override applyDefaultsToSelf(controlPointInfo: ControlPointInfo, difficulty: IBeatmapDifficultyInfo): void {
    super.applyDefaultsToSelf(controlPointInfo, difficulty);

    if (this.repeatIndex > 0) {
      // Repeat points after the first span should appear behind the still-visible one.
      this.timeFadeIn = 0;

      // The next end circle should appear exactly after the previous circle (on the same end) is hit.
      this.timePreempt = this.spanDuration * 2;
    } else {
      // The first end circle should fade in with the slider.
      this.timePreempt += this.startTime - this.slider.startTime;
    }
  }

  protected override createHitWindows(): HitWindows | null {
    return HitWindows.Empty;
  }

  override createJudgement(): Judgement {
    return new SliderEndJudgement();
  }
}
