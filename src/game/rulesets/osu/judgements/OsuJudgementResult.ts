// Ported from osu.Game.Rulesets.Osu/Judgements/OsuJudgementResult.cs, ComboResult.cs, OsuHitCircleJudgementResult.cs and
// OsuSliderJudgementResult.cs (OsuSpinnerJudgementResult is ported with the drawable spinner, with its spin history).

import type { Vector2F } from '@fw/layout/Vector2F';
import { JudgementResult } from '../../judgements/JudgementResult';
import type { HitCircle } from '../objects/HitCircle';

export enum ComboResult {
  None,
  Good,
  Perfect,
}

export class OsuJudgementResult extends JudgementResult {
  /** The ComboResult for this OsuJudgementResult. */
  comboType = ComboResult.None;
}

export class OsuHitCircleJudgementResult extends OsuJudgementResult {
  /** The HitCircle. */
  get hitCircle(): HitCircle {
    return this.hitObject as HitCircle;
  }

  /** The position of the player's cursor when the HitCircle was hit. */
  cursorPositionAtHit: Vector2F | null = null;
}

export class OsuSliderJudgementResult extends OsuJudgementResult {
  /** The tracking history: each entry is the time the tracking state changed and the state after it. (A Stack in C#: the last entry is its top.) */
  readonly trackingHistory: { time: number; tracking: boolean }[] = [{ time: -Infinity, tracking: false }];
}
