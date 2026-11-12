// Ported from osu.Game/Rulesets/Scoring/DrainingHealthProcessor.cs

import { BeatmapDifficultyInfo } from '../../beatmaps/BeatmapDifficulty';
import type { IBeatmap } from '../../beatmaps/Beatmap';
import { Period, PeriodTracker } from '../../utils/PeriodTracker';
import type { JudgementResult } from '../judgements/JudgementResult';
import { getEndTime } from '../objects/HitObject';
import { HealthProcessor } from './HealthProcessor';
import { HitResult, isBonus } from './HitResult';

/** A reasonable allowable error for the minimum health offset from targetMinimumHealth. A 1% error is unnoticeable. */
const minimum_health_error = 0.01;

/** The minimum health target at an HP drain rate of 0. */
const min_health_target = 0.99;

/** The minimum health target at an HP drain rate of 5. */
const mid_health_target = 0.9;

/** The minimum health target at an HP drain rate of 10. */
const max_health_target = 0.4;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * A HealthProcessor which continuously drains health.
 * At HP=0, the minimum health reached for a perfect play is 95%.
 * At HP=5, the minimum health reached for a perfect play is 70%.
 * At HP=10, the minimum health reached for a perfect play is 30%.
 */
export class DrainingHealthProcessor extends HealthProcessor {
  /** The rate at which health drains, per millisecond. */
  drainRate = 0;

  protected beatmap!: IBeatmap;

  protected readonly drainLenience: number;

  private readonly healthIncreases: { time: number; amount: number }[] = [];

  private gameplayEndTime = 0;
  private targetMinimumHealth = 0;

  private noDrainPeriodTracker: PeriodTracker | null = null;

  /**
   * @param drainStartTime The time after which draining should begin.
   * @param drainLenience A lenience to apply to the drain rate. A value of 0 uses the default drain rate; 0.5 halves the drop of the
   * minimum health reached; 1 disables health drain completely.
   */
  constructor(protected readonly drainStartTime: number, drainLenience = 0) {
    super();

    this.drainLenience = clamp(drainLenience, 0, 1);
  }

  protected override update(): void {
    super.update();

    const time = this.time;

    if (this.noDrainPeriodTracker?.isInAny(time.current) != null)
      return;

    // When jumping in and out of gameplay time within a single frame, health should only be drained for the period within the gameplay time
    const lastGameplayTime = clamp(time.current - time.elapsed, this.drainStartTime, this.gameplayEndTime);
    const currentGameplayTime = clamp(time.current, this.drainStartTime, this.gameplayEndTime);

    if (this.drainLenience < 1)
      this.health.value -= this.drainRate * (currentGameplayTime - lastGameplayTime);
  }

  override applyBeatmap(beatmap: IBeatmap): void {
    this.beatmap = beatmap;

    const hitObjects = beatmap.hitObjects;

    if (hitObjects.length > 0)
      this.gameplayEndTime = getEndTime(hitObjects[hitObjects.length - 1]);

    // Each break period is extended to the end of the last object before it and the start of the first object after it.
    this.noDrainPeriodTracker = new PeriodTracker(beatmap.breaks.toArray().map(breakPeriod => {
      let start = -Number.MAX_VALUE;
      let end = Number.MAX_VALUE;

      for (const hitObject of hitObjects) {
        const endTime = getEndTime(hitObject);
        if (endTime <= breakPeriod.startTime)
          start = endTime;
      }

      for (const hitObject of hitObjects) {
        if (hitObject.startTime >= breakPeriod.endTime) {
          end = hitObject.startTime;
          break;
        }
      }

      return new Period(start, end);
    }));

    this.targetMinimumHealth = BeatmapDifficultyInfo.difficultyRange(beatmap.difficulty.drainRate, min_health_target, mid_health_target, max_health_target);

    // Add back a portion of the amount of HP to be drained, depending on the lenience requested.
    this.targetMinimumHealth += this.drainLenience * (1 - this.targetMinimumHealth);

    // Ensure the target HP is within an acceptable range.
    this.targetMinimumHealth = clamp(this.targetMinimumHealth, 0, 1);

    super.applyBeatmap(beatmap);
  }

  protected override applyResultInternal(result: JudgementResult): void {
    super.applyResultInternal(result);

    if (this.isSimulating && !isBonus(result.type))
      this.healthIncreases.push({ time: getEndTime(result.hitObject) + result.timeOffset, amount: this.getHealthIncreaseFor(result) });
  }

  protected override checkDefaultFailCondition(result: JudgementResult): boolean {
    if (isBonus(result.judgement.maxResult) || result.type === HitResult.IgnoreHit)
      return false;

    return super.checkDefaultFailCondition(result);
  }

  protected override reset(storeResults: boolean): void {
    super.reset(storeResults);

    if (storeResults)
      this.drainRate = this.computeDrainRate();

    this.healthIncreases.length = 0;
  }

  protected computeDrainRate(): number {
    const healthIncreases = this.healthIncreases;

    if (healthIncreases.length <= 1)
      return 0;

    // (an int in C#: doubling it 31 times overflows to a negative value, which ends the loop)
    let adjustment = 1;
    let result = 1;

    const breaks = this.beatmap.breaks.toArray();

    // Although we expect the following loop to converge within 30 iterations (health within 1/2^31 accuracy of the target),
    // we'll still keep a safety measure to avoid infinite loops by detecting overflows.
    while (adjustment > 0) {
      let currentHealth = 1;
      let lowestHealth = 1;
      let currentBreak = 0;

      for (let i = 0; i < healthIncreases.length; i++) {
        const currentTime = healthIncreases[i].time;
        let lastTime = i > 0 ? healthIncreases[i - 1].time : this.drainStartTime;

        while (currentBreak < breaks.length && breaks[currentBreak].endTime <= currentTime) {
          // If two hitobjects are separated by a break period, there is no drain for the full duration between the hitobjects.
          // This differs from legacy (version < 8) beatmaps which continue draining until the break section is entered,
          // but this shouldn't have a noticeable impact in practice.
          lastTime = currentTime;
          currentBreak++;
        }

        // Apply health adjustments
        currentHealth -= (currentTime - lastTime) * result;
        lowestHealth = Math.min(lowestHealth, currentHealth);
        currentHealth = Math.min(1, currentHealth + healthIncreases[i].amount);

        // Common scenario for when the drain rate is definitely too harsh
        if (lowestHealth < 0)
          break;
      }

      // Stop if the resulting health is within a reasonable offset from the target
      if (Math.abs(lowestHealth - this.targetMinimumHealth) <= minimum_health_error)
        break;

      // This effectively works like a binary search - each iteration the search space moves closer to the target, but may exceed it.
      adjustment = (adjustment * 2) | 0;
      result += 1.0 / adjustment * Math.sign(lowestHealth - this.targetMinimumHealth);
    }

    return result;
  }
}
