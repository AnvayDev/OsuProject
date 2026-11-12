// Ported from osu.Game/Rulesets/Scoring/ScoreProcessor.cs (ResetFromReplayFrame and the frame statistics it restores are ported with
// spectating).

import { Bindable } from '@fw/bindables/Bindable';
import { BindableDouble, BindableInt, BindableLong } from '@fw/bindables/BindableNumber';
import { mathRound } from '@fw/utils/DotNet';
import type { IBeatmap } from '../../beatmaps/Beatmap';
import type { ScoreInfo } from '../../scoring/ScoreInfo';
import { ScoreRank } from '../../scoring/ScoreRank';
import type { JudgementResult } from '../judgements/JudgementResult';
import type { Mod } from '../mods/Mod';
import type { HitObject } from '../objects/HitObject';
import type { Ruleset } from '../Ruleset';
import { HitEvent } from './HitEvent';
import { affectsAccuracy, ALL_TYPES, breaksCombo, HitResult, increasesCombo, isBonus, isScorable } from './HitResult';
import { JudgementProcessor } from './JudgementProcessor';
import { ScoreMultiplierContext } from './ScoreMultiplierCalculator';

const accuracy_cutoff_x = 1;
const accuracy_cutoff_s = 0.95;
const accuracy_cutoff_a = 0.9;
const accuracy_cutoff_b = 0.8;
const accuracy_cutoff_c = 0.7;
const accuracy_cutoff_d = 0;

export enum ScoringMode {
  Standardised,
  Classic,
}

/** A mod that adjusts the rank a score receives (IApplicableToScoreProcessor.AdjustRank), recognised by its member. */
interface IAdjustsRank {
  adjustRank(rank: ScoreRank, accuracy: number): ScoreRank;
}

const adjustsRank = (mod: object): mod is IAdjustsRank => typeof (mod as Partial<IAdjustsRank>).adjustRank === 'function';

export class ScoreProcessor extends JudgementProcessor {
  /** The exponent applied to combo in the default implementation of getComboScoreChange. */
  static readonly COMBO_EXPONENT = 0.5;

  static readonly MAX_SCORE = 1000000;

  /** Whether hitEvents should be populated during application of results. Should only be disabled for special cases. When disabled, revertResult cannot be used. */
  trackHitEvents = true;

  /** The current total score. */
  readonly totalScore = new BindableLong().with({ minValue: 0 });

  /** The total number of points awarded for the score without including mod multipliers. The purpose of this property is to enable future lossless rebalancing of mod multipliers. */
  readonly totalScoreWithoutMods = new BindableLong().with({ minValue: 0 });

  /** The current accuracy. */
  readonly accuracy = new BindableDouble(1).with({ minValue: 0, maxValue: 1 });

  /** The minimum achievable accuracy for the whole beatmap at this stage of gameplay. Assumes any future judgements will be zero score. */
  readonly minimumAccuracy = new BindableDouble().with({ minValue: 0, maxValue: 1 });

  /** The maximum achievable accuracy for the whole beatmap at this stage of gameplay. Assumes any future judgements will be max score. */
  readonly maximumAccuracy = new BindableDouble(1).with({ minValue: 0, maxValue: 1 });

  /** The current combo. */
  readonly combo = new BindableInt();

  /** The current selected mods. */
  readonly mods = new Bindable<readonly Mod[]>([]);

  /** The beatmap currently being played. */
  readonly beatmap = new Bindable<IBeatmap | null>(null);

  private readonly rankBindable = new Bindable<ScoreRank>(ScoreRank.X);

  /** The current rank. */
  get rank(): Bindable<ScoreRank> {
    return this.rankBindable;
  }

  /** The highest combo achieved by this score. */
  readonly highestCombo = new BindableInt();

  private readonly hitEventList: HitEvent[] = [];

  /** The HitEvents collected so far. */
  get hitEvents(): readonly HitEvent[] {
    return this.hitEventList;
  }

  /** The maximum achievable total score. */
  maximumTotalScore = 0;

  /** The maximum achievable combo. */
  maximumCombo = 0;

  /** The maximum sum of accuracy-affecting judgements at the current point in time. Used to compute accuracy. */
  private currentMaximumBaseScore = 0;

  /** The sum of all accuracy-affecting judgements at the current point in time. Used to compute accuracy. */
  private currentBaseScore = 0;

  /** The maximum sum of all accuracy-affecting judgements in the beatmap. */
  private maximumBaseScore = 0;

  /** The maximum count of accuracy-affecting judgements in the beatmap. */
  private maximumAccuracyJudgementCount = 0;

  /** The count of accuracy-affecting judgements at the current point in time. */
  private currentAccuracyJudgementCount = 0;

  /** The maximum combo score in the beatmap. */
  private maximumComboPortion = 0;

  /** The combo score at the current point in time. */
  private currentComboPortion = 0;

  /** The bonus score at the current point in time. */
  private currentBonusPortion = 0;

  /** The total score multiplier. */
  private scoreMultiplier = 1;

  /** The maximum HitResult statistics of the beatmap (ApplyBeatmap must have been called). */
  get maximumStatistics(): Map<HitResult, number> {
    if (!this.beatmapApplied)
      throw new Error('Cannot access maximum statistics before calling applyBeatmap.');

    return new Map(this.maximumResultCounts);
  }

  get statistics(): ReadonlyMap<HitResult, number> {
    return this.scoreResultCounts;
  }

  private beatmapApplied = false;

  protected readonly scoreResultCounts = new Map<HitResult, number>();

  protected readonly maximumResultCounts = new Map<HitResult, number>();

  private lastHitObject: HitObject | null = null;

  /** Whether results should continue to be applied after the player has failed. */
  applyNewJudgementsWhenFailed = false;

  constructor(readonly ruleset: Ruleset) {
    super();

    this.accuracy.valueChanged.add(() => this.updateRank());

    this.mods.valueChanged.add(() => {
      this.updateScoreMultiplier();
      this.updateScore();
      this.updateRank();
    });

    this.beatmap.valueChanged.add(() => this.updateScoreMultiplier());
  }

  override applyBeatmap(beatmap: IBeatmap): void {
    // NOTE: The ordering of operations here is significant.
    // `Beatmap.Value` must be set before `base.ApplyBeatmap()` because changes to `Beatmap.Value`
    // trigger recalculation of `scoreMultiplier`,
    // and `base.ApplyBeatmap()` calls `SimulateAutoplay()` then `Reset(storeResults: true)`.
    // failing to calculate the correct score multiplier *before* autoplay simulation would result in
    // storing the incorrect value of `MaximumTotalScore`.
    this.beatmap.value = beatmap;
    super.applyBeatmap(beatmap);
    this.beatmapApplied = true;
  }

  protected override applyResultInternal(result: JudgementResult): void {
    result.comboAtJudgement = this.combo.value;
    result.highestComboAtJudgement = this.highestCombo.value;

    if (result.failedAtJudgement && !this.applyNewJudgementsWhenFailed)
      return;

    this.scoreResultCounts.set(result.type, (this.scoreResultCounts.get(result.type) ?? 0) + 1);

    if (increasesCombo(result.type))
      this.combo.value++;
    else if (breaksCombo(result.type))
      this.combo.value = 0;

    this.highestCombo.value = Math.max(this.highestCombo.value, this.combo.value);

    result.comboAfterJudgement = this.combo.value;
    result.highestComboAfterJudgement = this.highestCombo.value;

    if (affectsAccuracy(result.judgement.maxResult)) {
      this.currentMaximumBaseScore += this.getBaseScoreForResult(result.judgement.maxResult);
      this.currentAccuracyJudgementCount++;
    }

    if (affectsAccuracy(result.type))
      this.currentBaseScore += this.getBaseScoreForResult(result.type);

    if (isBonus(result.type))
      this.currentBonusPortion += this.getBonusScoreChange(result);
    else if (isScorable(result.type))
      this.currentComboPortion += this.getComboScoreChange(result);

    this.applyScoreChange(result);

    if (!this.isSimulating) {
      if (this.trackHitEvents) {
        this.hitEventList.push(this.createHitEvent(result));
        this.lastHitObject = result.hitObject;
      }

      this.updateScore();
    }
  }

  /** Creates the HitEvent that describes a JudgementResult. */
  protected createHitEvent(result: JudgementResult): HitEvent {
    return new HitEvent(result.timeOffset, result.gameplayRate, result.type, result.hitObject, this.lastHitObject, null);
  }

  protected override revertResultInternal(result: JudgementResult): void {
    if (!this.trackHitEvents)
      throw new Error('Rewind is not supported when trackHitEvents is disabled.');

    // the reason this is written so funnily rather than just using `ComboAtJudgement`
    // is to nullify impact of ordering when reverting concurrent judgement results
    // (think mania and multiple judgements within a frame).
    this.combo.value -= (result.comboAfterJudgement - result.comboAtJudgement);
    this.highestCombo.value -= (result.highestComboAfterJudgement - result.highestComboAtJudgement);

    if (result.failedAtJudgement && !this.applyNewJudgementsWhenFailed)
      return;

    this.scoreResultCounts.set(result.type, (this.scoreResultCounts.get(result.type) ?? 0) - 1);

    if (affectsAccuracy(result.judgement.maxResult)) {
      this.currentMaximumBaseScore -= this.getBaseScoreForResult(result.judgement.maxResult);
      this.currentAccuracyJudgementCount--;
    }

    if (affectsAccuracy(result.type))
      this.currentBaseScore -= this.getBaseScoreForResult(result.type);

    if (isBonus(result.type))
      this.currentBonusPortion -= this.getBonusScoreChange(result);
    else if (isScorable(result.type))
      this.currentComboPortion -= this.getComboScoreChange(result);

    this.removeScoreChange(result);

    this.lastHitObject = this.hitEventList[this.hitEventList.length - 1].lastHitObject;
    this.hitEventList.pop();

    this.updateScore();
  }

  protected getBonusScoreChange(result: JudgementResult): number {
    return this.getBaseScoreForResult(result.type);
  }

  protected getComboScoreChange(result: JudgementResult): number {
    return this.getBaseScoreForResult(result.judgement.maxResult) * Math.pow(result.comboAfterJudgement, ScoreProcessor.COMBO_EXPONENT);
  }

  getBaseScoreForResult(result: HitResult): number {
    switch (result) {
      default:
        return 0;

      case HitResult.SmallTickHit:
        return 10;

      case HitResult.LargeTickHit:
        return 30;

      case HitResult.SliderTailHit:
        return 150;

      case HitResult.Meh:
        return 50;

      case HitResult.Ok:
        return 100;

      case HitResult.Good:
        return 200;

      case HitResult.Great:
      case HitResult.Perfect: // Perfect doesn't actually give more score / accuracy directly.
        return 300;

      case HitResult.SmallBonus:
        return 10;

      case HitResult.LargeBonus:
        return 50;
    }
  }

  /** Used to compute additional (ruleset-specific) score values. */
  protected applyScoreChange(_result: JudgementResult): void {
  }

  /** Removes additional score values that were applied in applyScoreChange. */
  protected removeScoreChange(_result: JudgementResult): void {
  }

  private updateScore(): void {
    this.accuracy.value = this.currentMaximumBaseScore > 0 ? this.currentBaseScore / this.currentMaximumBaseScore : 1;
    this.minimumAccuracy.value = this.maximumBaseScore > 0 ? this.currentBaseScore / this.maximumBaseScore : 0;
    this.maximumAccuracy.value = this.maximumBaseScore > 0 ? (this.currentBaseScore + (this.maximumBaseScore - this.currentMaximumBaseScore)) / this.maximumBaseScore : 1;

    const comboProgress = this.maximumComboPortion > 0 ? this.currentComboPortion / this.maximumComboPortion : 1;
    const accuracyProgress = this.maximumAccuracyJudgementCount > 0 ? this.currentAccuracyJudgementCount / this.maximumAccuracyJudgementCount : 1;

    this.totalScoreWithoutMods.value = mathRound(this.computeTotalScore(comboProgress, accuracyProgress, this.currentBonusPortion));
    this.totalScore.value = mathRound(this.totalScoreWithoutMods.value * this.scoreMultiplier);
  }

  private updateRank(): void {
    // Once failed, we shouldn't update the rank anymore.
    if (this.rankBindable.value === ScoreRank.F)
      return;

    let newRank = this.rankFromScore(this.accuracy.value, this.scoreResultCounts);

    for (const mod of this.mods.value) {
      if (adjustsRank(mod))
        newRank = mod.adjustRank(newRank, this.accuracy.value);
    }

    this.rankBindable.value = newRank;
  }

  private updateScoreMultiplier(): void {
    if (this.beatmap.value === null)
      return;

    const calculator = this.ruleset.createScoreMultiplierCalculator(new ScoreMultiplierContext(this.beatmap.value.beatmapInfo.difficulty));
    this.scoreMultiplier = calculator.calculateFor(this.mods.value);
  }

  protected computeTotalScore(comboProgress: number, accuracyProgress: number, bonusPortion: number): number {
    return 500000 * this.accuracy.value * comboProgress
      + 500000 * Math.pow(this.accuracy.value, 5) * accuracyProgress
      + bonusPortion;
  }

  /** Resets this ScoreProcessor to a default state. storeResults: whether to store the current state of the ScoreProcessor for future use. */
  protected override reset(storeResults: boolean): void {
    // Run one last time to store max values.
    this.updateScore();

    super.reset(storeResults);

    this.hitEventList.length = 0;
    this.lastHitObject = null;

    if (storeResults) {
      this.maximumBaseScore = this.currentBaseScore;
      this.maximumComboPortion = this.currentComboPortion;
      this.maximumAccuracyJudgementCount = this.currentAccuracyJudgementCount;

      this.maximumResultCounts.clear();
      for (const [result, count] of this.scoreResultCounts)
        this.maximumResultCounts.set(result, count);

      this.maximumTotalScore = this.totalScore.value;
      this.maximumCombo = this.highestCombo.value;
    }

    this.scoreResultCounts.clear();

    this.currentBaseScore = 0;
    this.currentMaximumBaseScore = 0;
    this.currentAccuracyJudgementCount = 0;
    this.currentComboPortion = 0;
    this.currentBonusPortion = 0;

    this.totalScore.value = 0;
    this.accuracy.value = 1;
    this.combo.value = 0;
    this.highestCombo.value = 0;

    this.updateRank();
  }

  /** Retrieve a score populated with data for the current play this processor is responsible for. */
  populateScore(score: ScoreInfo): void {
    score.combo = this.combo.value;
    score.maxCombo = this.highestCombo.value;
    score.accuracy = this.accuracy.value;
    score.rank = this.rank.value;
    score.hitEvents = this.hitEventList;
    score.statistics.clear();
    score.maximumStatistics.clear();

    for (const result of ALL_TYPES)
      score.statistics.set(result, this.scoreResultCounts.get(result) ?? 0);

    for (const result of ALL_TYPES)
      score.maximumStatistics.set(result, this.maximumResultCounts.get(result) ?? 0);

    // Populate total score after everything else.
    score.totalScoreWithoutMods = this.totalScoreWithoutMods.value;
    score.totalScore = this.totalScore.value;
  }

  /** Populates a failed score, marking it with the ScoreRank.F rank. */
  failScore(score: ScoreInfo): void {
    if (this.rank.value === ScoreRank.F)
      return;

    score.passed = false;
    this.rankBindable.value = ScoreRank.F;

    this.populateScore(score);
  }

  // #region Static helper methods

  /** Given an accuracy (0..1), return the correct ScoreRank. */
  rankFromScore(accuracy: number, _results: ReadonlyMap<HitResult, number>): ScoreRank {
    if (accuracy === accuracy_cutoff_x)
      return ScoreRank.X;
    if (accuracy >= accuracy_cutoff_s)
      return ScoreRank.S;
    if (accuracy >= accuracy_cutoff_a)
      return ScoreRank.A;
    if (accuracy >= accuracy_cutoff_b)
      return ScoreRank.B;
    if (accuracy >= accuracy_cutoff_c)
      return ScoreRank.C;

    return ScoreRank.D;
  }

  /** Given a ScoreRank, return the cutoff accuracy (0..1). Accuracy must be greater than or equal to the cutoff to qualify for the provided rank. */
  accuracyCutoffFromRank(rank: ScoreRank): number {
    switch (rank) {
      case ScoreRank.X:
      case ScoreRank.XH:
        return accuracy_cutoff_x;

      case ScoreRank.S:
      case ScoreRank.SH:
        return accuracy_cutoff_s;

      case ScoreRank.A:
        return accuracy_cutoff_a;

      case ScoreRank.B:
        return accuracy_cutoff_b;

      case ScoreRank.C:
        return accuracy_cutoff_c;

      case ScoreRank.D:
        return accuracy_cutoff_d;

      default:
        throw new RangeError(`rank (${rank})`);
    }
  }

  // #endregion

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.hitEventList.length = 0;
  }
}
