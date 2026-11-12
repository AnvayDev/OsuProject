// Ported from osu.Game.Rulesets.Osu.Tests/OsuHealthProcessorTest.cs, plus the hit windows of OsuHitWindows.cs at known difficulties.

import { describe, expect, it } from 'vitest';
import { OsuBeatmap } from '@game/rulesets/osu/beatmaps/OsuBeatmap';
import { OsuJudgementResult } from '@game/rulesets/osu/judgements/OsuJudgementResult';
import { HitCircle } from '@game/rulesets/osu/objects/HitCircle';
import type { OsuHitObject } from '@game/rulesets/osu/objects/OsuHitObject';
import { Slider } from '@game/rulesets/osu/objects/Slider';
import { SliderHeadCircle } from '@game/rulesets/osu/objects/SliderHeadCircle';
import { SliderRepeat } from '@game/rulesets/osu/objects/SliderRepeat';
import { SliderTailCircle } from '@game/rulesets/osu/objects/SliderTailCircle';
import { SliderTick } from '@game/rulesets/osu/objects/SliderTick';
import { Spinner } from '@game/rulesets/osu/objects/Spinner';
import { SpinnerBonusTick } from '@game/rulesets/osu/objects/SpinnerBonusTick';
import { SpinnerTick } from '@game/rulesets/osu/objects/SpinnerTick';
import { OsuHealthProcessor } from '@game/rulesets/osu/scoring/OsuHealthProcessor';
import { OsuHitWindows } from '@game/rulesets/osu/scoring/OsuHitWindows';
import { HitResult } from '@game/rulesets/scoring/HitResult';

const classic = <T extends { classicSliderBehaviour: boolean }>(hitObject: T): T => {
  hitObject.classicSliderBehaviour = true;
  return hitObject;
};

// hitobject, starting HP, fail expected after miss
const test_cases: [name: string, create: () => OsuHitObject, startingHealth: number, failExpected: boolean][] = [
  ['HitCircle', () => new HitCircle(), 0.01, true],
  ['SliderHeadCircle', () => new SliderHeadCircle(), 0.01, true],
  ['SliderHeadCircle (classic)', () => classic(new SliderHeadCircle()), 0.01, true],
  ['SliderTick', () => new SliderTick(), 0.01, true],
  ['SliderRepeat', () => new SliderRepeat(new Slider()), 0.01, true],
  ['SliderTailCircle', () => new SliderTailCircle(new Slider()), 0, true],
  ['SliderTailCircle (classic)', () => classic(new SliderTailCircle(new Slider())), 0.01, true],
  ['Slider', () => new Slider(), 0, true],
  ['Slider (classic)', () => classic(new Slider()), 0.01, true],
  ['SpinnerTick', () => new SpinnerTick(), 0, false],
  ['SpinnerBonusTick', () => new SpinnerBonusTick(), 0, false],
  ['Spinner', () => new Spinner(), 0.01, true],
];

function apply(hitObject: OsuHitObject, startingHealth: number, min: boolean): OsuHealthProcessor {
  const healthProcessor = new OsuHealthProcessor(0);
  const beatmap = new OsuBeatmap();
  beatmap.hitObjects = [hitObject];
  healthProcessor.applyBeatmap(beatmap);
  healthProcessor.health.value = startingHealth;

  const result = new OsuJudgementResult(hitObject, hitObject.createJudgement());
  result.type = min ? result.judgement.minResult : result.judgement.maxResult;
  healthProcessor.applyResult(result);

  return healthProcessor;
}

describe('OsuHealthProcessor', () => {
  it.each(test_cases)('fails after the min result of %s as the client does', (_name, create, startingHealth, failExpected) => {
    expect(apply(create(), startingHealth, true).hasFailed).toBe(failExpected);
  });

  it.each(test_cases)('never fails after the max result of %s', (_name, create, startingHealth) => {
    expect(apply(create(), startingHealth, false).hasFailed).toBe(false);
  });
});

describe('OsuHitWindows', () => {
  // floor(DifficultyRange(OD, range)) - 0.5, with ranges (80, 50, 20), (140, 100, 60), (200, 150, 100); the miss window is fixed.
  it.each([
    [0, 79.5, 139.5, 199.5],
    [5, 49.5, 99.5, 149.5],
    [8, 31.5, 75.5, 119.5],
    [10, 19.5, 59.5, 99.5],
  ])('gives OD %i the windows great %f, ok %f, meh %f', (overallDifficulty, great, ok, meh) => {
    const windows = new OsuHitWindows();
    windows.setDifficulty(overallDifficulty);

    expect(windows.windowFor(HitResult.Great)).toBe(great);
    expect(windows.windowFor(HitResult.Ok)).toBe(ok);
    expect(windows.windowFor(HitResult.Meh)).toBe(meh);
    expect(windows.windowFor(HitResult.Miss)).toBe(400);
  });

  it('judges by absolute offset and allows only great, ok, meh and miss', () => {
    const windows = new OsuHitWindows();
    windows.setDifficulty(8);

    expect(windows.resultFor(0)).toBe(HitResult.Great);
    expect(windows.resultFor(-31.5)).toBe(HitResult.Great);
    expect(windows.resultFor(31.6)).toBe(HitResult.Ok);
    expect(windows.resultFor(-75.6)).toBe(HitResult.Meh);
    expect(windows.resultFor(119.6)).toBe(HitResult.Miss);
    expect(windows.resultFor(400.1)).toBe(HitResult.None);
    expect(windows.canBeHit(119.5)).toBe(true);
    expect(windows.canBeHit(119.6)).toBe(false);
    expect(windows.isHitResultAllowed(HitResult.Perfect)).toBe(false);
    expect(windows.isHitResultAllowed(HitResult.Good)).toBe(false);
  });
});
