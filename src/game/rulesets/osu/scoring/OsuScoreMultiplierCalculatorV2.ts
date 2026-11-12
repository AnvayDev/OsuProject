// Ported from osu.Game.Rulesets.Osu/Scoring/OsuScoreMultiplierCalculatorV2.cs

import type { IBeatmapDifficultyInfo } from '../../../beatmaps/BeatmapDifficulty';
import { ModAdaptiveSpeed, ModWindDown, ModWindUp, type ModTimeRamp } from '../../mods/Mods';
import { ScoreMultiplierCalculator, type ScoreMultiplierContext } from '../../scoring/ScoreMultiplierCalculator';
import {
  OsuModApproachDifferent, OsuModAutopilot, OsuModBlinds, OsuModClassic, OsuModDaycore, OsuModDeflate, OsuModDepth, OsuModDifficultyAdjust,
  OsuModDoubleTime, OsuModEasy, OsuModFlashlight, OsuModFreezeFrame, OsuModGrow, OsuModHalfTime, OsuModHardRock, OsuModHidden,
  OsuModMagnetised, OsuModNightcore, OsuModNoFail, OsuModRandom, OsuModRelax, OsuModRepel, OsuModSpunOut, OsuModSynesthesia,
  OsuModTargetPractice, OsuModTraceable, OsuModWiggle,
} from '../mods/OsuMods';

const blinds_multiplier = 1.24;

export class OsuScoreMultiplierCalculatorV2 extends ScoreMultiplierCalculator {
  constructor(context: ScoreMultiplierContext) {
    super(context);

    // #region Difficulty Reduction

    this.single(OsuModEasy, easyMultiplier);
    this.single(OsuModNoFail, 0.5);
    this.single(OsuModHalfTime, halfTime => halfTimeMultiplier(halfTime.speedChange.value));
    this.single(OsuModDaycore, daycore => halfTimeMultiplier(daycore.speedChange.value));

    // #endregion

    // #region Difficulty Increase

    this.single(OsuModHardRock, 1.09);
    // Sudden Death (1.0x)
    // Perfect (1.0x)
    this.single(OsuModDoubleTime, doubleTime => doubleTimeMultiplier(doubleTime.speedChange.value));
    this.single(OsuModNightcore, nightcore => doubleTimeMultiplier(nightcore.speedChange.value));

    this.combination(OsuModHidden, OsuModBlinds, () => blinds_multiplier);
    this.combination(OsuModHidden, OsuModWiggle, hidden => hiddenMultiplier(hidden, true));
    this.combination(OsuModHidden, OsuModGrow, hidden => hiddenMultiplier(hidden, true));
    this.combination(OsuModHidden, OsuModDeflate, (hidden, deflate) => hiddenMultiplier(hidden, true) * deflateMultiplier(deflate));
    this.combination(OsuModHidden, OsuModRepel, hidden => hiddenMultiplier(hidden, true));
    this.combination(OsuModHidden, OsuModDepth, hidden => hiddenMultiplier(hidden, true));
    this.single(OsuModHidden, hidden => hiddenMultiplier(hidden, false));

    this.combination(OsuModTraceable, OsuModBlinds, () => blinds_multiplier);
    this.single(OsuModTraceable, 1.02);

    this.combination(OsuModFlashlight, OsuModFreezeFrame, flashlight => 1 + (flashlightMultiplier(flashlight) - 1) / 2);
    this.single(OsuModFlashlight, flashlightMultiplier);
    this.single(OsuModBlinds, blinds_multiplier);
    // Strict Tracking (1.0x)
    // Accuracy Challenge (1.0x)

    // #endregion

    // #region Conversion

    this.single(OsuModTargetPractice, 0.01);
    this.single(OsuModDifficultyAdjust, difficultyAdjust => difficultyAdjustMultiplier(difficultyAdjust, this.context.beatmapDifficultyWithoutMods));
    this.single(OsuModClassic, classic => classic.classicNoteLock.value ? 0.985 : 0.96);
    this.single(OsuModRandom, 0.7);
    // Mirror (1.0x)
    // Alternate (1.0x)
    // Single Tap (1.0x)

    // #endregion

    // #region Automation

    // Autoplay (1.0x)
    // Cinema (1.0x)
    this.single(OsuModRelax, 0.1);
    this.single(OsuModAutopilot, 0.1);
    this.single(OsuModSpunOut, 0.95);

    // #endregion

    // #region Fun

    // Transform (1.0x)
    // Wiggle (1.0x)
    // Spin In (1.0x)
    // Grow (1.0x)
    this.single(OsuModDeflate, deflateMultiplier);
    this.single(ModWindUp, timeRampMultiplier);
    this.single(ModWindDown, timeRampMultiplier);
    // Barrel Roll (1.0x)
    this.single(OsuModApproachDifferent, 0.7);
    // Muted (1.0x)
    // No Scope (1.0x)
    this.single(OsuModMagnetised, magnetised => 0.7 - magnetised.attractionStrength.value * 0.6);
    // Repel (1.0x)
    this.single(ModAdaptiveSpeed, 0.1);
    // Freeze Frame (1.0x)
    // Bubbles (1.0x)
    this.single(OsuModSynesthesia, 0.99);
    // Depth (1.0x)
    // Bloom (1.0x)

    // #endregion

    // #region System

    // Touch Device (1.0x)
    // Score V2 (1.0x)

    // #endregion
  }
}

function easyMultiplier(easy: OsuModEasy): number {
  // 0.8x base multiplier
  // Reduce by 0.1x per extra life
  const value = 0.8 - Math.max(0, 0.1 * (easy.retries.value - easy.retries.default));
  return Math.max(0.4, value);
}

function halfTimeMultiplier(speedChange: number): number {
  // 0.2x at 0.5x speed, +0.07x per 0.05x speed increment.
  // Default HT (0.75x) = 0.55
  return Math.trunc(speedChange * 20) / 20.0 * 1.4 - 0.5;
}

function doubleTimeMultiplier(speedChange: number): number {
  // Floor to the nearest multiple of 0.1.
  const value = Math.trunc(speedChange * 10) / 10.0;

  // 0.01 penalty for non-default rates.
  const penalty = value !== 1.5 && value !== 1.0 ? 0.01 : 0.0;

  // Linear from 1.0 to 1.46, minus the penalty.
  // Default DT (1.5x) = 1.23
  return (value - 1) * 0.46 + 1 - penalty;
}

function hiddenMultiplier(hidden: OsuModHidden, otherModsProvideTimingInfo: boolean): number {
  let value = 1.04;

  if (hidden.onlyFadeApproachCircles.value)
    value -= 0.02;

  if (otherModsProvideTimingInfo)
    value -= 0.02;

  return value;
}

function flashlightMultiplier(flashlight: OsuModFlashlight): number {
  // Multiplier of 1.2x, reduced by 0.02 per 0.1 increase in flashlight size.
  let value = Math.max(1.02, Math.min(1.2, 1.2 - 0.2 * (flashlight.sizeMultiplier.value - 1)));

  if (!flashlight.comboBasedSize.value)
    value = 1 + (value - 1) / 5;

  return value;
}

function difficultyAdjustMultiplier(difficultyAdjust: OsuModDifficultyAdjust, beatmapDifficulty: IBeatmapDifficultyInfo): number {
  const selectedCircleSize = difficultyAdjust.circleSize.value ?? beatmapDifficulty.circleSize;
  const selectedDrainRate = difficultyAdjust.drainRate.value ?? beatmapDifficulty.drainRate;
  const selectedOverallDifficulty = difficultyAdjust.overallDifficulty.value ?? beatmapDifficulty.overallDifficulty;
  const selectedApproachRate = difficultyAdjust.approachRate.value ?? beatmapDifficulty.approachRate;

  const csDifference = Math.abs(selectedCircleSize - beatmapDifficulty.circleSize);
  const hpDifference = Math.abs(selectedDrainRate - beatmapDifficulty.drainRate);
  const odDifference = Math.abs(selectedOverallDifficulty - beatmapDifficulty.overallDifficulty);
  const arDifference = Math.abs(selectedApproachRate - beatmapDifficulty.approachRate);

  // Per parameter, reduce multiplier by 0.05x per 0.1 change.
  const csMultiplier = Math.max(0.1, 1.0 - csDifference * 0.5);
  const hpMultiplier = Math.max(0.1, 1.0 - hpDifference * 0.5);
  const odMultiplier = Math.max(0.1, 1.0 - odDifference * 0.5);
  const arMultiplier = Math.max(0.1, 1.0 - arDifference * 0.5);

  return Math.max(0.1, csMultiplier * hpMultiplier * odMultiplier * arMultiplier);
}

function timeRampMultiplier(timeRamp: ModTimeRamp): number {
  const minSpeed = Math.min(timeRamp.initialRate.value, timeRamp.finalRate.value);
  const maxSpeed = Math.max(timeRamp.initialRate.value, timeRamp.finalRate.value);

  const minMultiplier = minSpeed < 1 ? halfTimeMultiplier(minSpeed) : doubleTimeMultiplier(minSpeed);
  const maxMultiplier = maxSpeed < 1 ? halfTimeMultiplier(maxSpeed) : doubleTimeMultiplier(maxSpeed);

  return 0.8 * minMultiplier + 0.2 * maxMultiplier;
}

function deflateMultiplier(deflate: OsuModDeflate): number {
  return 1.0 - Math.max(0, 0.02 * (deflate.startScale.value - deflate.startScale.default));
}
