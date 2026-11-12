// Ported from osu.Game.Rulesets.Osu/Scoring/OsuScoreMultiplierCalculatorV1.cs: the multipliers of scores set before total score version
// 30000017.

import { ModAdaptiveSpeed, ModWindDown, ModWindUp } from '../../mods/Mods';
import { ScoreMultiplierCalculator, type ScoreMultiplierContext } from '../../scoring/ScoreMultiplierCalculator';
import {
  OsuModAutopilot, OsuModBlinds, OsuModClassic, OsuModDaycore, OsuModDifficultyAdjust, OsuModDoubleTime, OsuModEasy, OsuModFlashlight,
  OsuModHalfTime, OsuModHardRock, OsuModHidden, OsuModMagnetised, OsuModNightcore, OsuModNoFail, OsuModRelax, OsuModSpunOut,
  OsuModSynesthesia, OsuModTargetPractice,
} from '../mods/OsuMods';

export class OsuScoreMultiplierCalculatorV1 extends ScoreMultiplierCalculator {
  constructor(context: ScoreMultiplierContext) {
    super(context);

    // #region Difficulty Reduction

    this.single(OsuModEasy, 0.5);
    this.single(OsuModNoFail, 0.5);
    this.single(OsuModHalfTime, halfTime => rateAdjustMultiplier(halfTime.speedChange.value));
    this.single(OsuModDaycore, daycore => rateAdjustMultiplier(daycore.speedChange.value));

    // #endregion

    // #region Difficulty Increase

    this.single(OsuModHardRock, hardRock => hardRock.usesDefaultConfiguration ? 1.06 : 1);
    // Sudden Death
    // Perfect
    this.single(OsuModDoubleTime, doubleTime => rateAdjustMultiplier(doubleTime.speedChange.value));
    this.single(OsuModNightcore, nightcore => rateAdjustMultiplier(nightcore.speedChange.value));
    this.single(OsuModHidden, hidden => hidden.usesDefaultConfiguration ? 1.06 : 1);
    // Traceable
    this.single(OsuModFlashlight, flashlight => flashlight.usesDefaultConfiguration ? 1.12 : 1);
    this.single(OsuModBlinds, blinds => blinds.usesDefaultConfiguration ? 1.12 : 1);
    // Strict Tracking
    // Accuracy Challenge

    // #endregion

    // #region Conversion

    this.single(OsuModTargetPractice, 0.1);
    this.single(OsuModDifficultyAdjust, 0.5);
    this.single(OsuModClassic, 0.96);
    // Random
    // Mirror
    // Alternate
    // Single Tap

    // #endregion

    // #region Automation

    // Autoplay
    // Cinema
    this.single(OsuModRelax, 0.1);
    this.single(OsuModAutopilot, 0.1);
    this.single(OsuModSpunOut, 0.9);

    // #endregion

    // #region Fun

    // Transform
    // Wiggle
    // Spin In
    // Grow
    // Deflate
    this.single(ModWindUp, 0.5);
    this.single(ModWindDown, 0.5);
    // Barrel Roll
    // Approach Different
    // Muted
    // No Scope
    this.single(OsuModMagnetised, 0.5);
    // Repel
    this.single(ModAdaptiveSpeed, 0.5);
    // Freeze Frame
    // Bubbles
    this.single(OsuModSynesthesia, 0.8);
    // Depth
    // Bloom

    // #endregion
  }
}

function rateAdjustMultiplier(speedChange: number): number {
  // Round to the nearest multiple of 0.1.
  let value = Math.trunc(speedChange * 10) / 10.0;

  // Offset back to 0.
  value -= 1;

  if (speedChange >= 1)
    return 1 + value / 5;
  else
    return 0.6 + value;
}
