// Ported from osu.Game/Rulesets/Judgements/JudgementResult.cs

import { getEndTime, type HitObject } from '../objects/HitObject';
import { HitResult, isHit } from '../scoring/HitResult';
import type { Judgement } from './Judgement';

/** The scoring result of a DrawableHitObject. */
export class JudgementResult {
  /** Whether this JudgementResult is the result of a hit or a miss. */
  type = HitResult.None;

  /** The time at which this JudgementResult occurred. Populated when added via DrawableHitObject.ApplyResult. */
  rawTime: number | null = null;

  /** The gameplay rate at the time this JudgementResult occurred. */
  gameplayRate: number | null = null;

  /** The combo prior to this JudgementResult occurring. */
  comboAtJudgement = 0;

  /** The combo after this JudgementResult occurred. */
  comboAfterJudgement = 0;

  /** The highest combo achieved prior to this JudgementResult occurring. */
  highestComboAtJudgement = 0;

  /** The highest combo achieved after this JudgementResult occurred. */
  highestComboAfterJudgement = 0;

  /** The health prior to this JudgementResult occurring. */
  healthAtJudgement = 0;

  /** Whether the user was in a failed state prior to this JudgementResult occurring. */
  failedAtJudgement = false;

  /**
   * @param hitObject The HitObject which was judged.
   * @param judgement The Judgement to refer to for scoring information.
   */
  constructor(readonly hitObject: HitObject, readonly judgement: Judgement) {
    this.reset();
  }

  /**
   * The offset of rawTime from the end time of hitObject, clamped by HitObject.maximumJudgementOffset.
   * For leniency calculation, a negative value indicates the hit was early and a positive value that it was late.
   */
  get timeOffset(): number {
    return this.rawTime !== null ? Math.min(this.rawTime - getEndTime(this.hitObject), this.hitObject.maximumJudgementOffset) : 0;
  }

  set timeOffset(value: number) {
    this.rawTime = getEndTime(this.hitObject) + value;
  }

  /** The absolute time at which this JudgementResult occurred, clamped by the end time of hitObject plus HitObject.maximumJudgementOffset. */
  get timeAbsolute(): number {
    return this.rawTime !== null ? Math.min(this.rawTime, getEndTime(this.hitObject) + this.hitObject.maximumJudgementOffset) : getEndTime(this.hitObject);
  }

  /** Whether a miss or hit occurred. */
  get hasResult(): boolean {
    return this.type > HitResult.None;
  }

  /** Whether a successful hit occurred. */
  get isHit(): boolean {
    return isHit(this.type);
  }

  /** The increase in health resulting from this judgement result. */
  get healthIncrease(): number {
    return this.judgement.healthIncreaseForResult(this);
  }

  reset(): void {
    this.type = HitResult.None;
    this.rawTime = null;
  }

  toString(): string {
    return `${HitResult[this.type]} (${this.judgement})`;
  }
}
