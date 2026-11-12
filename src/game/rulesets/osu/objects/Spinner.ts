// Ported from osu.Game.Rulesets.Osu/Objects/Spinner.cs

import { Vector2F } from '@fw/layout/Vector2F';
import type { HitSampleInfo } from '../../../audio/HitSampleInfo';
import { BeatmapDifficultyInfo, type DifficultyRange, type IBeatmapDifficultyInfo } from '../../../beatmaps/BeatmapDifficulty';
import type { ControlPointInfo } from '../../../beatmaps/controlPoints/ControlPointInfo';
import type { Judgement } from '../../judgements/Judgement';
import type { IHasDuration } from '../../objects/types/Types';
import { HitWindows } from '../../scoring/HitWindows';
import { OsuJudgement } from '../judgements/OsuJudgement';
import { OsuHitObject } from './OsuHitObject';
import { SpinnerBonusTick } from './SpinnerBonusTick';
import { SpinnerTick } from './SpinnerTick';

/** The gap between spinner completion and the first bonus-awarding spin. */
const bonus_spins_gap = 2;

export class Spinner extends OsuHitObject implements IHasDuration {
  /** The RPM required to clear the spinner at ODs [ 0, 5, 10 ]. */
  static readonly CLEAR_RPM_RANGE: DifficultyRange = { min: 90, mid: 150, max: 225 };

  /** The RPM required to complete the spinner and receive full score at ODs [ 0, 5, 10 ]. */
  static readonly COMPLETE_RPM_RANGE: DifficultyRange = { min: 250, mid: 380, max: 430 };

  get endTime(): number {
    return this.startTime + this.duration;
  }

  set endTime(value: number) {
    this.duration = value - this.startTime;
  }

  duration = 0;

  /** Number of spins required to finish the spinner without miss. */
  spinsRequired = 1;

  /** The number of spins required to start receiving bonus score. The first bonus is awarded on this spin count. */
  get spinsRequiredForBonus(): number {
    return this.spinsRequired + bonus_spins_gap;
  }

  /** Number of spins available to give bonus, beyond spinsRequired. */
  maximumBonusSpins = 1;

  override get stackOffset(): Vector2F {
    return Vector2F.Zero;
  }

  protected override get isSpinner(): boolean {
    return true;
  }

  protected override applyDefaultsToSelf(controlPointInfo: ControlPointInfo, difficulty: IBeatmapDifficultyInfo): void {
    super.applyDefaultsToSelf(controlPointInfo, difficulty);

    // The average RPS required over the length of the spinner to clear the spinner.
    const minRps = BeatmapDifficultyInfo.difficultyRange(difficulty.overallDifficulty, Spinner.CLEAR_RPM_RANGE) / 60;

    // The RPS required over the length of the spinner to receive full score (all normal + bonus ticks).
    const maxRps = BeatmapDifficultyInfo.difficultyRange(difficulty.overallDifficulty, Spinner.COMPLETE_RPM_RANGE) / 60;

    const secondsDuration = this.duration / 1000;

    // Allow a 0.1ms floating point precision error in the calculation of the duration.
    const duration_error = 0.0001;

    this.spinsRequired = Math.trunc(minRps * secondsDuration + duration_error);
    this.maximumBonusSpins = Math.max(0, Math.trunc(maxRps * secondsDuration + duration_error) - this.spinsRequired - bonus_spins_gap);
  }

  protected override createNestedHitObjects(): void {
    super.createNestedHitObjects();

    const totalSpins = this.maximumBonusSpins + this.spinsRequired + bonus_spins_gap;

    for (let i = 0; i < totalSpins; i++) {
      // (float)(i + 1) / totalSpins * Duration: the division is in floats.
      const startTime = this.startTime + Math.fround(Math.fround(i + 1) / totalSpins) * this.duration;

      const tick = i < this.spinsRequiredForBonus ? new SpinnerTick() : new SpinnerBonusTick();
      tick.startTime = startTime;
      tick.spinnerDuration = this.duration;

      if (tick instanceof SpinnerBonusTick)
        tick.samples = [this.createHitSampleInfo('spinnerbonus')];

      this.addNested(tick);
    }
  }

  override createJudgement(): Judgement {
    return new OsuJudgement();
  }

  protected override createHitWindows(): HitWindows | null {
    return HitWindows.Empty;
  }

  override get auxiliarySamples(): readonly HitSampleInfo[] {
    return this.createSpinningSamples();
  }

  createSpinningSamples(): HitSampleInfo[] {
    const referenceSample = this.samples[0];

    if (referenceSample === undefined)
      return [];

    return [referenceSample.with({ name: 'spinnerspin' })];
  }
}
