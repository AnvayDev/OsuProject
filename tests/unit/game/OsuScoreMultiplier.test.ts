// Ported from osu.Game.Rulesets.Osu.Tests/OsuScoreMultiplierTest.cs and osu.Game/Tests/Rulesets/RulesetScoreMultiplierTest.cs.
// The table of mods and expected multipliers is the client's, converted mechanically.

import { describe, expect, it } from 'vitest';
import { BeatmapDifficulty } from '@game/beatmaps/BeatmapDifficulty';
import type { Mod } from '@game/rulesets/mods/Mod';
import { ModAdaptiveSpeed, ModScoreV2, ModWindDown, ModWindUp } from '@game/rulesets/mods/Mods';
import {
  OsuModAccuracyChallenge, OsuModAlternate, OsuModApproachDifferent, OsuModAutopilot, OsuModAutoplay, OsuModBarrelRoll, OsuModBlinds, OsuModBloom, OsuModBubbles, OsuModCinema, OsuModClassic, OsuModDaycore, OsuModDeflate, OsuModDepth, OsuModDifficultyAdjust, OsuModDoubleTime, OsuModEasy, OsuModFlashlight, OsuModFreezeFrame, OsuModGrow, OsuModHalfTime, OsuModHardRock, OsuModHidden, OsuModMagnetised, OsuModMirror, OsuModMuted, OsuModNightcore, OsuModNoFail, OsuModNoScope, OsuModPerfect, OsuModRandom, OsuModRelax, OsuModRepel, OsuModSingleTap, OsuModSpinIn, OsuModSpunOut, OsuModStrictTracking, OsuModSuddenDeath, OsuModSynesthesia, OsuModTargetPractice, OsuModTouchDevice, OsuModTraceable, OsuModTransform, OsuModWiggle,
} from '@game/rulesets/osu/mods/OsuMods';
import { OsuRuleset } from '@game/rulesets/osu/OsuRuleset';
import { ScoreMultiplierContext } from '@game/rulesets/scoring/ScoreMultiplierCalculator';
import { ScoreInfo } from '@game/scoring/ScoreInfo';

const ruleset = new OsuRuleset();

/** `new TMod { Setting = { Value = v } }` */
function mod<T extends Mod>(type: new () => T, settings: Record<string, number | boolean>): T {
  const instance = new type();

  for (const [name, value] of Object.entries(settings))
    (instance as unknown as Record<string, { value: number | boolean }>)[name].value = value;

  return instance;
}

const test_cases: [mods: () => Mod[], expectedMultiplier: number][] = [
  // Difficulty Reduction
  [() => [new OsuModEasy()], 0.8],
  [() => [mod(OsuModEasy, { retries: 1 })], 0.8],
  [() => [mod(OsuModEasy, { retries: 3 })], 0.7],
  [() => [mod(OsuModEasy, { retries: 5 })], 0.5],
  [() => [mod(OsuModEasy, { retries: 8 })], 0.4],
  [() => [new OsuModNoFail()], 0.5],
  [() => [mod(OsuModHalfTime, { speedChange: 0.50 })], 0.20],
  [() => [mod(OsuModHalfTime, { speedChange: 0.55 })], 0.27],
  [() => [mod(OsuModHalfTime, { speedChange: 0.60 })], 0.34],
  [() => [mod(OsuModHalfTime, { speedChange: 0.65 })], 0.41],
  [() => [mod(OsuModHalfTime, { speedChange: 0.70 })], 0.48],
  [() => [mod(OsuModHalfTime, { speedChange: 0.75 })], 0.55],
  [() => [mod(OsuModHalfTime, { speedChange: 0.80 })], 0.62],
  [() => [mod(OsuModHalfTime, { speedChange: 0.85 })], 0.69],
  [() => [mod(OsuModHalfTime, { speedChange: 0.90 })], 0.76],
  [() => [mod(OsuModHalfTime, { speedChange: 0.95 })], 0.83],
  [() => [mod(OsuModHalfTime, { speedChange: 0.99 })], 0.83],
  [() => [mod(OsuModDaycore, { speedChange: 0.50 })], 0.20],
  [() => [mod(OsuModDaycore, { speedChange: 0.55 })], 0.27],
  [() => [mod(OsuModDaycore, { speedChange: 0.60 })], 0.34],
  [() => [mod(OsuModDaycore, { speedChange: 0.65 })], 0.41],
  [() => [mod(OsuModDaycore, { speedChange: 0.70 })], 0.48],
  [() => [mod(OsuModDaycore, { speedChange: 0.75 })], 0.55],
  [() => [mod(OsuModDaycore, { speedChange: 0.80 })], 0.62],
  [() => [mod(OsuModDaycore, { speedChange: 0.85 })], 0.69],
  [() => [mod(OsuModDaycore, { speedChange: 0.90 })], 0.76],
  [() => [mod(OsuModDaycore, { speedChange: 0.95 })], 0.83],
  [() => [mod(OsuModDaycore, { speedChange: 0.99 })], 0.83],
  // Difficulty Increase
  [() => [new OsuModHardRock()], 1.09],
  [() => [new OsuModSuddenDeath()], 1],
  [() => [new OsuModPerfect()], 1],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.01 })], 1.000],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.05 })], 1.000],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.10 })], 1.036],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.15 })], 1.036],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.20 })], 1.082],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.25 })], 1.082],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.30 })], 1.128],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.35 })], 1.128],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.40 })], 1.174],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.45 })], 1.174],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.50 })], 1.230],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.55 })], 1.230],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.60 })], 1.266],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.65 })], 1.266],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.70 })], 1.312],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.75 })], 1.312],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.80 })], 1.358],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.85 })], 1.358],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.90 })], 1.404],
  [() => [mod(OsuModDoubleTime, { speedChange: 1.95 })], 1.404],
  [() => [mod(OsuModDoubleTime, { speedChange: 2.00 })], 1.450],
  [() => [mod(OsuModNightcore, { speedChange: 1.01 })], 1.000],
  [() => [mod(OsuModNightcore, { speedChange: 1.05 })], 1.000],
  [() => [mod(OsuModNightcore, { speedChange: 1.10 })], 1.036],
  [() => [mod(OsuModNightcore, { speedChange: 1.15 })], 1.036],
  [() => [mod(OsuModNightcore, { speedChange: 1.20 })], 1.082],
  [() => [mod(OsuModNightcore, { speedChange: 1.25 })], 1.082],
  [() => [mod(OsuModNightcore, { speedChange: 1.30 })], 1.128],
  [() => [mod(OsuModNightcore, { speedChange: 1.35 })], 1.128],
  [() => [mod(OsuModNightcore, { speedChange: 1.40 })], 1.174],
  [() => [mod(OsuModNightcore, { speedChange: 1.45 })], 1.174],
  [() => [mod(OsuModNightcore, { speedChange: 1.50 })], 1.230],
  [() => [mod(OsuModNightcore, { speedChange: 1.55 })], 1.230],
  [() => [mod(OsuModNightcore, { speedChange: 1.60 })], 1.266],
  [() => [mod(OsuModNightcore, { speedChange: 1.65 })], 1.266],
  [() => [mod(OsuModNightcore, { speedChange: 1.70 })], 1.312],
  [() => [mod(OsuModNightcore, { speedChange: 1.75 })], 1.312],
  [() => [mod(OsuModNightcore, { speedChange: 1.80 })], 1.358],
  [() => [mod(OsuModNightcore, { speedChange: 1.85 })], 1.358],
  [() => [mod(OsuModNightcore, { speedChange: 1.90 })], 1.404],
  [() => [mod(OsuModNightcore, { speedChange: 1.95 })], 1.404],
  [() => [mod(OsuModNightcore, { speedChange: 2.00 })], 1.450],
  [() => [new OsuModHidden()], 1.04],
  [() => [mod(OsuModHidden, { onlyFadeApproachCircles: true })], 1.02],
  [() => [new OsuModTraceable()], 1.02],
  [() => [new OsuModFlashlight()], 1.2],
  [() => [mod(OsuModFlashlight, { sizeMultiplier: Math.fround(0.5) })], 1.2],
  [() => [mod(OsuModFlashlight, { sizeMultiplier: Math.fround(0.9) })], 1.2],
  [() => [mod(OsuModFlashlight, { sizeMultiplier: Math.fround(1.1) })], 1.18],
  [() => [mod(OsuModFlashlight, { sizeMultiplier: Math.fround(1.5) })], 1.1],
  [() => [mod(OsuModFlashlight, { sizeMultiplier: Math.fround(1.9) })], 1.02],
  [() => [mod(OsuModFlashlight, { sizeMultiplier: Math.fround(2) })], 1.02],
  [() => [mod(OsuModFlashlight, { comboBasedSize: false })], 1.04],
  [() => [mod(OsuModFlashlight, { sizeMultiplier: Math.fround(1.9), comboBasedSize: false })], 1.004],
  [() => [new OsuModBlinds()], 1.24],
  [() => [new OsuModStrictTracking()], 1],
  [() => [new OsuModAccuracyChallenge()], 1],
  // Conversion
  [() => [new OsuModTargetPractice()], 0.01],
  [() => [new OsuModDifficultyAdjust()], 1],
  [() => [new OsuModClassic()], 0.985],
  [() => [mod(OsuModClassic, { classicNoteLock: false })], 0.96],
  [() => [new OsuModRandom()], 0.7],
  [() => [new OsuModMirror()], 1],
  [() => [new OsuModAlternate()], 1],
  [() => [new OsuModSingleTap()], 1],
  // Automation
  [() => [new OsuModAutoplay()], 1],
  [() => [new OsuModCinema()], 1],
  [() => [new OsuModRelax()], 0.1],
  [() => [new OsuModAutopilot()], 0.1],
  [() => [new OsuModSpunOut()], 0.95],
  // Fun
  [() => [new OsuModTransform()], 1],
  [() => [new OsuModWiggle()], 1],
  [() => [new OsuModSpinIn()], 1],
  [() => [new OsuModGrow()], 1],
  [() => [new OsuModDeflate()], 1],
  [() => [mod(OsuModDeflate, { startScale: 5 })], 0.94],
  [() => [new ModWindUp()], 0.8 * 1 + 0.2 * 1.230],
  [() => [mod(ModWindUp, { initialRate: 0.7, finalRate: 1.2 })], 0.8 * 0.48 + 0.2 * 1.082],
  [() => [mod(ModWindUp, { initialRate: 0.7, finalRate: 0.9 })], 0.8 * 0.48 + 0.2 * 0.76],
  [() => [mod(ModWindUp, { initialRate: 1.1, finalRate: 1.4 })], 0.8 * 1.036 + 0.2 * 1.174],
  [() => [new ModWindDown()], 0.8 * 0.55 + 0.2 * 1],
  [() => [mod(ModWindDown, { initialRate: 1.2, finalRate: 0.7 })], 0.8 * 0.48 + 0.2 * 1.082],
  [() => [mod(ModWindDown, { initialRate: 0.9, finalRate: 0.7 })], 0.8 * 0.48 + 0.2 * 0.76],
  [() => [mod(ModWindDown, { initialRate: 1.4, finalRate: 1.1 })], 0.8 * 1.036 + 0.2 * 1.174],
  [() => [new OsuModBarrelRoll()], 1],
  [() => [new OsuModApproachDifferent()], 0.7],
  [() => [new OsuModMuted()], 1],
  [() => [new OsuModNoScope()], 1],
  [() => [new OsuModMagnetised()], 0.4],
  [() => [mod(OsuModMagnetised, { attractionStrength: Math.fround(0.05) })], 0.67],
  [() => [mod(OsuModMagnetised, { attractionStrength: Math.fround(0.2) })], 0.58],
  [() => [mod(OsuModMagnetised, { attractionStrength: Math.fround(0.7) })], 0.28],
  [() => [mod(OsuModMagnetised, { attractionStrength: 1 })], 0.1],
  [() => [new OsuModRepel()], 1],
  [() => [new ModAdaptiveSpeed()], 0.1],
  [() => [new OsuModFreezeFrame()], 1],
  [() => [new OsuModBubbles()], 1],
  [() => [new OsuModSynesthesia()], 0.99],
  [() => [new OsuModDepth()], 1],
  [() => [new OsuModBloom()], 1],
  // System
  [() => [new OsuModTouchDevice()], 1],
  [() => [new ModScoreV2()], 1],
  // Combinations
  [() => [new OsuModHidden(), new OsuModHardRock()], 1.04 * 1.09],
  [() => [new OsuModHidden(), new OsuModWiggle()], 1.02],
  [() => [new OsuModHidden(), new OsuModGrow()], 1.02],
  [() => [new OsuModHidden(), new OsuModDeflate()], 1.02],
  [() => [new OsuModHidden(), mod(OsuModDeflate, { startScale: 4 })], 1.02 * 0.96],
  [() => [new OsuModHidden(), new OsuModRepel()], 1.02],
  [() => [mod(OsuModHidden, { onlyFadeApproachCircles: true }), new OsuModRepel()], 1],
  [() => [new OsuModHidden(), new OsuModDepth()], 1.02],
  [() => [new OsuModHidden(), new OsuModDepth(), new OsuModHardRock()], 1.02 * 1.09],
  [() => [new OsuModHidden(), new OsuModBlinds()], 1.24],
  [() => [new OsuModHidden(), new OsuModBlinds(), new OsuModHardRock()], 1.24 * 1.09],
  [() => [new OsuModTraceable(), new OsuModBlinds()], 1.24],
  [() => [new OsuModTraceable(), new OsuModBlinds(), new OsuModHardRock()], 1.24 * 1.09],
  [() => [new OsuModFlashlight(), new OsuModFreezeFrame()], 1.1],
];

describe('OsuScoreMultiplierCalculator', () => {
  it('gives no mods a multiplier of one', () => {
    expect(ruleset.createScoreMultiplierCalculator(new ScoreMultiplierContext(new BeatmapDifficulty())).calculateFor([])).toBe(1);
  });

  it.each(test_cases.map(([mods, expected]) => [mods().map(m => m.acronym).join('+'), mods, expected] as const))('multiplies %s as the client does', (_name, mods, expectedMultiplier) => {
    const calculator = ruleset.createScoreMultiplierCalculator(new ScoreMultiplierContext(new BeatmapDifficulty()));

    expect(Math.abs(calculator.calculateFor(mods()) - expectedMultiplier)).toBeLessThanOrEqual(1e-7);
  });

  // [circle size, approach rate, overall difficulty, drain rate, expected]
  it.each([
    [null, null, null, null, 1],
    [2.9, null, null, null, 0.95],
    [3.1, null, null, null, 0.95],
    [null, 3.9, null, null, 0.95],
    [null, 4.1, null, null, 0.95],
    [null, null, 4.9, null, 0.95],
    [null, null, 5.1, null, 0.95],
    [null, null, null, 5.9, 0.95],
    [null, null, null, 6.1, 0.95],
    [2.9, 3.9, null, null, 0.95 * 0.95],
    [2.9, 3.9, 4.9, null, 0.95 * 0.95 * 0.95],
    [2.9, 3.9, 4.9, 5.9, 0.95 * 0.95 * 0.95 * 0.95],
    [0.0, null, null, null, 0.1],
    [0.0, 0.0, 0.0, 0.0, 0.1],
  ])('multiplies Difficulty Adjust (CS %s, AR %s, OD %s, HP %s) as %f', (cs, ar, od, hp, expectedMultiplier) => {
    const difficulty = new BeatmapDifficulty();
    difficulty.circleSize = 3;
    difficulty.approachRate = 4;
    difficulty.overallDifficulty = 5;
    difficulty.drainRate = 6;

    const f = (v: number | null) => v === null ? null : Math.fround(v);

    const difficultyAdjust = new OsuModDifficultyAdjust();
    difficultyAdjust.circleSize.value = f(cs);
    difficultyAdjust.approachRate.value = f(ar);
    difficultyAdjust.overallDifficulty.value = f(od);
    difficultyAdjust.drainRate.value = f(hp);

    const calculator = ruleset.createScoreMultiplierCalculator(new ScoreMultiplierContext(difficulty));

    expect(Math.abs(calculator.calculateFor([difficultyAdjust]) - expectedMultiplier)).toBeLessThanOrEqual(1e-3);
  });

  it.each([
    [30000001, 0.96],
    [30000009, 0.96],
    [30000016, 0.96],
    [30000017, 0.985],
    [null, 0.985],
  ])('picks the Classic multiplier of total score version %s: %f', (totalScoreVersion, expectedMultiplier) => {
    let scoreInfo: ScoreInfo | null = null;

    if (totalScoreVersion !== null) {
      scoreInfo = new ScoreInfo();
      scoreInfo.totalScoreVersion = totalScoreVersion;
    }

    const calculator = ruleset.createScoreMultiplierCalculator(new ScoreMultiplierContext(new BeatmapDifficulty(), scoreInfo));

    expect(Math.abs(calculator.calculateFor([new OsuModClassic()]) - expectedMultiplier)).toBeLessThanOrEqual(1e-7);
  });

  it('keeps a very small combined multiplier above zero', () => {
    const mods = [
      mod(OsuModEasy, { retries: 10 }),
      new OsuModNoFail(),
      mod(OsuModHalfTime, { speedChange: 0.5 }),
      new OsuModTargetPractice(),
      mod(OsuModClassic, { classicNoteLock: false }),
      mod(OsuModDeflate, { startScale: 25 }),
      mod(OsuModMagnetised, { attractionStrength: 1 }),
      new OsuModSynesthesia(),
    ];

    const calculator = ruleset.createScoreMultiplierCalculator(new ScoreMultiplierContext(new BeatmapDifficulty()));

    expect(calculator.calculateFor(mods)).toBeGreaterThan(0);
  });
});
