// Ported from osu.Game/Rulesets/Scoring/HealthProcessor.cs

import { BindableDouble } from '@fw/bindables/BindableNumber';
import { Precision } from '@fw/layout/Primitives';
import type { JudgementResult } from '../judgements/JudgementResult';
import { JudgementProcessor } from './JudgementProcessor';

export abstract class HealthProcessor extends JudgementProcessor {
  /**
   * Invoked when the ScoreProcessor is in a failed state. The handlers return true if the fail was permitted (C#'s event returns the
   * last subscriber's answer; with no subscriber the fail is permitted).
   */
  failed: (() => boolean) | null = null;

  /** Additional conditions on top of the default fail condition that cause a failing state. */
  readonly failConditions: ((processor: HealthProcessor, result: JudgementResult) => boolean)[] = [];

  /** The current health. */
  readonly health = new BindableDouble(1).with({ minValue: 0, maxValue: 1 });

  /** Whether this ScoreProcessor has already triggered the failed state. */
  hasFailed = false;

  /** Immediately triggers a failure for this HealthProcessor. */
  triggerFailure(): void {
    if (this.hasFailed)
      return;

    if (this.failed?.() !== false)
      this.hasFailed = true;
  }

  protected override applyResultInternal(result: JudgementResult): void {
    result.healthAtJudgement = this.health.value;
    result.failedAtJudgement = this.hasFailed;

    if (this.hasFailed)
      return;

    this.health.value += this.getHealthIncreaseFor(result);

    if (this.meetsAnyFailCondition(result))
      this.triggerFailure();
  }

  protected override revertResultInternal(result: JudgementResult): void {
    this.hasFailed = result.failedAtJudgement;

    if (this.hasFailed)
      return;

    this.health.value = result.healthAtJudgement;
  }

  /** Retrieves the health increase for a JudgementResult. */
  protected getHealthIncreaseFor(result: JudgementResult): number {
    return result.healthIncrease;
  }

  /** Checks whether the default conditions for failing are met. */
  protected checkDefaultFailCondition(_result: JudgementResult): boolean {
    return Precision.almostBigger(this.health.minValue, this.health.value);
  }

  /** Whether the current state of HealthProcessor or the provided JudgementResult meets any fail condition. */
  private meetsAnyFailCondition(result: JudgementResult): boolean {
    if (this.checkDefaultFailCondition(result))
      return true;

    for (const condition of this.failConditions) {
      if (condition(this, result))
        return true;
    }

    return false;
  }

  protected override reset(storeResults: boolean): void {
    super.reset(storeResults);

    this.health.value = 1;
    this.hasFailed = false;
  }
}
