// Ported from osu.Game.Rulesets.Osu/Objects/SliderTick.cs

import type { IBeatmapDifficultyInfo } from '../../../beatmaps/BeatmapDifficulty';
import type { ControlPointInfo } from '../../../beatmaps/controlPoints/ControlPointInfo';
import type { Judgement } from '../../judgements/Judgement';
import { HitWindows } from '../../scoring/HitWindows';
import { SliderTickJudgement } from '../judgements/OsuJudgement';
import { OsuHitObject } from './OsuHitObject';

export class SliderTick extends OsuHitObject {
  spanIndex = 0;
  spanStartTime = 0;
  pathProgress = 0;

  protected override applyDefaultsToSelf(controlPointInfo: ControlPointInfo, difficulty: IBeatmapDifficultyInfo): void {
    super.applyDefaultsToSelf(controlPointInfo, difficulty);

    let offset: number;

    if (this.spanIndex > 0)
      // Adding 200 to include the offset stable used.
      // This is so on repeats ticks don't appear too late to be visually processed by the player.
      offset = 200;
    else
      offset = this.timePreempt * Math.fround(0.66);

    this.timePreempt = (this.startTime - this.spanStartTime) / 2 + offset;
  }

  protected override createHitWindows(): HitWindows | null {
    return HitWindows.Empty;
  }

  override createJudgement(): Judgement {
    return new SliderTickJudgement();
  }
}
