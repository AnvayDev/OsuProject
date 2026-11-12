// Ported from osu.Game.Tests/Rulesets/Scoring/ScoreProcessorTest.cs. The expected scores are the client's.
// Not ported: TestBeatmapWithALotOfObjectsDoesNotOverflowClassicScore, which guards a 64-bit integer overflow (scores are doubles here).

import { beforeEach, describe, expect, it } from 'vitest';
import { Beatmap, type IBeatmap } from '@game/beatmaps/Beatmap';
import { WorkingBeatmap } from '@game/beatmaps/WorkingBeatmap';
import { Judgement } from '@game/rulesets/judgements/Judgement';
import { JudgementResult } from '@game/rulesets/judgements/JudgementResult';
import type { Mod } from '@game/rulesets/mods/Mod';
import { HitObject } from '@game/rulesets/objects/HitObject';
import { OsuJudgement } from '@game/rulesets/osu/judgements/OsuJudgement';
import { OsuModHardRock, OsuModHidden } from '@game/rulesets/osu/mods/OsuMods';
import { HitCircle } from '@game/rulesets/osu/objects/HitCircle';
import { OsuRuleset } from '@game/rulesets/osu/OsuRuleset';
import { Ruleset } from '@game/rulesets/Ruleset';
import {
  affectsAccuracy, affectsCombo, ALL_TYPES, breaksCombo, HitResult, increasesCombo, isBasic, isBonus, isHit, isScorable, isTick,
} from '@game/rulesets/scoring/HitResult';
import { ScoreMultiplierCalculator, type ScoreMultiplierContext } from '@game/rulesets/scoring/ScoreMultiplierCalculator';
import { ScoreProcessor, ScoringMode } from '@game/rulesets/scoring/ScoreProcessor';
import { getDisplayScore } from '@game/scoring/legacy/ScoreInfoExtensions';
import { ScoreRank } from '@game/scoring/ScoreRank';

const R = HitResult;

class TestJudgement extends Judgement {
  constructor(private readonly max: HitResult, private readonly min: HitResult | null = null) {
    super();
  }

  override get maxResult(): HitResult { return this.max; }
  override get minResult(): HitResult { return this.min ?? super.minResult; }
}

class TestHitObject extends HitObject {
  constructor(private readonly maxResult: HitResult, private readonly minResult: HitResult | null = null) {
    super();
  }

  override createJudgement(): Judgement {
    return new TestJudgement(this.maxResult, this.minResult);
  }
}

class TestScoreMultiplierCalculator extends ScoreMultiplierCalculator {
  constructor(context: ScoreMultiplierContext) {
    super(context);
    this.single(OsuModHardRock, context.beatmapDifficultyWithoutMods.circleSize === 4 ? 1.1 : 1.0);
  }
}

class TestRuleset extends Ruleset {
  override get shortName(): string { return ''; }
  override getModsFor(): Mod[] { throw new Error('not implemented'); }
  override createBeatmapConverter(): never { throw new Error('not implemented'); }
  override createScoreMultiplierCalculator(context: ScoreMultiplierContext): ScoreMultiplierCalculator { return new TestScoreMultiplierCalculator(context); }
}

class TestScoreProcessor extends ScoreProcessor {
  constructor() {
    super(new TestRuleset());
  }

  protected override computeTotalScore(comboProgress: number, accuracyProgress: number, bonusPortion: number): number {
    return 500000 * comboProgress + 500000 * this.accuracy.value * accuracyProgress + bonusPortion;
  }
}

class TestWorkingBeatmap extends WorkingBeatmap {
  constructor(private readonly decoded: IBeatmap) {
    super(decoded.beatmapInfo, null!);
  }

  protected override getBeatmap(): Promise<IBeatmap | null> { return Promise.resolve(this.decoded); }
  override getBackground(): never { throw new Error('not implemented'); }
  protected override getBeatmapTrack(): never { throw new Error('not implemented'); }
  override getStream(): never { throw new Error('not implemented'); }
}

/** TestBeatmap: the client's test beatmap has circle size 4; only the hit objects matter here. */
function testBeatmap(hitObjects: HitObject[] = []): Beatmap {
  const beatmap = new Beatmap();
  beatmap.difficulty.circleSize = 4;
  beatmap.beatmapInfo.difficulty.circleSize = 4;
  beatmap.hitObjects = hitObjects;
  return beatmap;
}

const result = (hitObject: HitObject, judgement: Judgement, type: HitResult): JudgementResult => {
  const r = new JudgementResult(hitObject, judgement);
  r.type = type;
  return r;
};

describe('ScoreProcessor', () => {
  let scoreProcessor: ScoreProcessor;
  let beatmap: Beatmap;

  beforeEach(() => {
    scoreProcessor = new ScoreProcessor(new OsuRuleset());
    beatmap = testBeatmap([new HitCircle()]);
  });

  it.each([
    [ScoringMode.Standardised, R.Meh, 83_398],
    [ScoringMode.Standardised, R.Ok, 168_724],
    [ScoringMode.Standardised, R.Great, 1_000_000],
    [ScoringMode.Classic, R.Meh, 8_343],
    [ScoringMode.Classic, R.Ok, 16_878],
    [ScoringMode.Classic, R.Great, 100_033],
  ])('scores a single osu! hit (mode %i, result %i) as %i', (scoringMode, hitResult, expectedScore) => {
    scoreProcessor.applyBeatmap(beatmap);

    scoreProcessor.applyResult(result(beatmap.hitObjects[0], new OsuJudgement(), hitResult));

    expect(Math.abs(getDisplayScore(scoreProcessor, scoringMode) - expectedScore)).toBeLessThanOrEqual(0.5);
  });

  it.each([
    [ScoringMode.Standardised, R.Miss, R.Great, 0],
    [ScoringMode.Standardised, R.Meh, R.Great, 34_734],
    [ScoringMode.Standardised, R.Ok, R.Great, 69_925],
    [ScoringMode.Standardised, R.Good, R.Perfect, 154_499],
    [ScoringMode.Standardised, R.Great, R.Great, 326_963],
    [ScoringMode.Standardised, R.Perfect, R.Perfect, 326_963],
    [ScoringMode.Standardised, R.SmallTickMiss, R.SmallTickHit, 0],
    [ScoringMode.Standardised, R.SmallTickHit, R.SmallTickHit, 493_652],
    [ScoringMode.Standardised, R.LargeTickMiss, R.LargeTickHit, 0],
    [ScoringMode.Standardised, R.LargeTickHit, R.LargeTickHit, 326_963],
    [ScoringMode.Standardised, R.SliderTailHit, R.SliderTailHit, 371_627],
    [ScoringMode.Standardised, R.SmallBonus, R.SmallBonus, 1_000_030],
    [ScoringMode.Standardised, R.LargeBonus, R.LargeBonus, 1_000_150],
    [ScoringMode.Classic, R.Miss, R.Great, 0],
    [ScoringMode.Classic, R.Meh, R.Great, 3_492],
    [ScoringMode.Classic, R.Ok, R.Great, 7_029],
    [ScoringMode.Classic, R.Good, R.Perfect, 15_530],
    [ScoringMode.Classic, R.Great, R.Great, 32_867],
    [ScoringMode.Classic, R.Perfect, R.Perfect, 32_867],
    [ScoringMode.Classic, R.SmallTickMiss, R.SmallTickHit, 0],
    [ScoringMode.Classic, R.SmallTickHit, R.SmallTickHit, 49_365],
    [ScoringMode.Classic, R.LargeTickMiss, R.LargeTickHit, 0],
    [ScoringMode.Classic, R.LargeTickHit, R.LargeTickHit, 32_696],
    [ScoringMode.Classic, R.SliderTailHit, R.SliderTailHit, 37_163],
    [ScoringMode.Classic, R.SmallBonus, R.SmallBonus, 100_003],
    [ScoringMode.Classic, R.LargeBonus, R.LargeBonus, 100_015],
  ])('scores four results with one miss (mode %i, result %i of max %i) as %i', (scoringMode, hitResult, maxResult, expectedScore) => {
    const minResult = new TestJudgement(hitResult).minResult;

    const hitObject = new TestHitObject(maxResult);
    const fourObjectBeatmap = testBeatmap([hitObject, hitObject, hitObject, hitObject]);

    scoreProcessor.applyBeatmap(fourObjectBeatmap);

    for (let i = 0; i < 4; i++)
      scoreProcessor.applyResult(result(fourObjectBeatmap.hitObjects[i], fourObjectBeatmap.hitObjects[i].judgement, i === 2 ? minResult : hitResult));

    expect(Math.abs(getDisplayScore(scoreProcessor, scoringMode) - expectedScore)).toBeLessThanOrEqual(0.5);
  });

  it.each([ScoringMode.Standardised, ScoringMode.Classic])('scores an empty beatmap as zero (mode %i)', scoringMode => {
    scoreProcessor.applyBeatmap(testBeatmap());

    expect(getDisplayScore(scoreProcessor, scoringMode)).toBe(0);
  });

  it.each([
    [R.IgnoreHit, R.IgnoreMiss],
    [R.Meh, R.Miss],
    [R.Ok, R.Miss],
    [R.Good, R.Miss],
    [R.Great, R.Miss],
    [R.Perfect, R.Miss],
    [R.SmallTickHit, R.SmallTickMiss],
    [R.LargeTickHit, R.LargeTickMiss],
    [R.SliderTailHit, R.IgnoreMiss],
    [R.SmallBonus, R.IgnoreMiss],
    [R.LargeBonus, R.IgnoreMiss],
  ])('gives max result %i the min result %i', (hitResult, expectedMinResult) => {
    expect(new TestJudgement(hitResult).minResult).toBe(expectedMinResult);
  });

  // [result, AffectsCombo, AffectsAccuracy, IsBonus, IsHit, IsScorable]
  it.each([
    [R.None, false, false, false, false, false],
    [R.IgnoreMiss, false, false, false, false, false],
    [R.IgnoreHit, false, false, false, true, false],
    [R.Miss, true, true, false, false, true],
    [R.Meh, true, true, false, true, true],
    [R.Ok, true, true, false, true, true],
    [R.Good, true, true, false, true, true],
    [R.Great, true, true, false, true, true],
    [R.Perfect, true, true, false, true, true],
    [R.SmallTickMiss, false, true, false, false, true],
    [R.SmallTickHit, false, true, false, true, true],
    [R.LargeTickMiss, true, true, false, false, true],
    [R.LargeTickHit, true, true, false, true, true],
    [R.SliderTailHit, true, true, false, true, true],
    [R.SmallBonus, false, false, true, true, true],
    [R.LargeBonus, false, false, true, true, true],
  ])('classifies hit result %i', (hitResult, combo, accuracy, bonus, hit, scorable) => {
    expect(affectsCombo(hitResult)).toBe(combo);
    expect(affectsAccuracy(hitResult)).toBe(accuracy);
    expect(isBonus(hitResult)).toBe(bonus);
    expect(isHit(hitResult)).toBe(hit);
    expect(isScorable(hitResult)).toBe(scorable);
  });

  it('treats LegacyComboIncrease as a combo-only, non-gameplay result', () => {
    const r = R.LegacyComboIncrease;

    expect(increasesCombo(r)).toBe(true);
    expect(breaksCombo(r)).toBe(false);
    expect(affectsCombo(r)).toBe(true);
    expect(affectsAccuracy(r)).toBe(false);
    expect(isBasic(r)).toBe(false);
    expect(isTick(r)).toBe(false);
    expect(isBonus(r)).toBe(false);
    expect(isHit(r)).toBe(true);
    expect(isScorable(r)).toBe(true);
    expect(ALL_TYPES).not.toContain(r);
  });

  it('breaks combo without touching accuracy on ComboBreak', () => {
    const r = R.ComboBreak;

    expect(increasesCombo(r)).toBe(false);
    expect(breaksCombo(r)).toBe(true);
    expect(affectsCombo(r)).toBe(true);
    expect(affectsAccuracy(r)).toBe(false);
    expect(isBasic(r)).toBe(false);
    expect(isTick(r)).toBe(false);
    expect(isBonus(r)).toBe(false);
    expect(isHit(r)).toBe(false);
    expect(isScorable(r)).toBe(true);
    expect(ALL_TYPES).toContain(r);

    beatmap = testBeatmap([new TestHitObject(R.Great), new TestHitObject(R.IgnoreHit, R.ComboBreak)]);

    scoreProcessor = new TestScoreProcessor();
    scoreProcessor.applyBeatmap(beatmap);

    scoreProcessor.applyResult(result(beatmap.hitObjects[0], beatmap.hitObjects[0].judgement, R.Great));
    expect(scoreProcessor.combo.value).toBe(1);
    expect(scoreProcessor.accuracy.value).toBe(1);

    scoreProcessor.applyResult(result(beatmap.hitObjects[1], beatmap.hitObjects[1].judgement, R.ComboBreak));
    expect(scoreProcessor.combo.value).toBe(0);
    expect(scoreProcessor.accuracy.value).toBe(1);
  });

  it('keeps accuracy off 0 and 1 when nearly perfect', () => {
    const count_judgements = 1000;
    const count_misses = 1;

    const hitObject = new TestHitObject(R.Great);
    beatmap = testBeatmap(Array.from({ length: count_judgements }, () => hitObject));

    scoreProcessor = new TestScoreProcessor();
    scoreProcessor.applyBeatmap(beatmap);

    for (let i = 0; i < beatmap.hitObjects.length; i++)
      scoreProcessor.applyResult(result(beatmap.hitObjects[i], beatmap.hitObjects[i].judgement, i === 0 ? R.Miss : R.Great));

    const expected = (count_judgements - count_misses) / count_judgements;
    const actual = scoreProcessor.accuracy.value;

    expect(actual).not.toBe(0);
    expect(actual).not.toBe(1);
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-3);
  });

  it.each([R.Great, R.LargeTickHit])('lowers accuracy on an IgnoreMiss of a judgement with max result %i', maxResult => {
    scoreProcessor.applyBeatmap(testBeatmap([new TestHitObject(maxResult, R.IgnoreMiss)]));

    scoreProcessor.applyResult(result(beatmap.hitObjects[0], new TestJudgement(maxResult, R.IgnoreMiss), R.IgnoreMiss));

    expect(scoreProcessor.accuracy.value).not.toBe(1);
  });

  it('awards normal grades', () => {
    scoreProcessor.applyBeatmap(new Beatmap());
    expect(scoreProcessor.rank.value).toBe(ScoreRank.X);

    scoreProcessor.accuracy.value = Math.fround(0.99);
    expect(scoreProcessor.rank.value).toBe(ScoreRank.S);
  });

  it('awards silver grades with Hidden', () => {
    scoreProcessor.applyBeatmap(new Beatmap());
    expect(scoreProcessor.rank.value).toBe(ScoreRank.X);

    scoreProcessor.mods.value = [new OsuModHidden()];
    expect(scoreProcessor.rank.value).toBe(ScoreRank.XH);

    scoreProcessor.accuracy.value = Math.fround(0.99);
    expect(scoreProcessor.rank.value).toBe(ScoreRank.SH);
  });

  it('awards silver grades when the mods are applied first', () => {
    scoreProcessor.mods.value = [new OsuModHidden()];
    scoreProcessor.applyBeatmap(new Beatmap());
    expect(scoreProcessor.rank.value).toBe(ScoreRank.XH);

    scoreProcessor.accuracy.value = Math.fround(0.99);
    expect(scoreProcessor.rank.value).toBe(ScoreRank.SH);
  });

  it.each([false, true])('accounts combo and reverts to zero (shuffled revert: %s)', shuffleResults => {
    const testBeatmap = new Beatmap();
    testBeatmap.hitObjects = Array.from({ length: 40 }, () => new TestHitObject(R.Perfect, R.Miss));
    scoreProcessor.applyBeatmap(testBeatmap);

    const results: JudgementResult[] = [];

    const apply = (i: number, type: HitResult) => {
      const judgementResult = result(testBeatmap.hitObjects[i], new TestJudgement(R.Perfect, R.Miss), type);
      results.push(judgementResult);
      scoreProcessor.applyResult(judgementResult);
    };

    for (let i = 0; i < 25; ++i) {
      apply(i, R.Perfect);
      expect(scoreProcessor.combo.value).toBe(i + 1);
    }

    apply(25, R.Miss);
    expect(scoreProcessor.combo.value).toBe(0);

    for (let i = 26; i < 40; ++i) {
      apply(i, R.Perfect);
      expect(scoreProcessor.combo.value).toBe(i - 25);
    }

    expect(scoreProcessor.maximumStatistics.get(R.Perfect)).toBe(40);
    expect(scoreProcessor.combo.value).toBe(14);
    expect(scoreProcessor.highestCombo.value).toBe(25);

    // random shuffle is VERY extreme and overkill.
    // it might not work correctly for any other `ScoreProcessor` property, and the intermediate results likely make no sense.
    // the goal is only to demonstrate idempotency to zero when reverting all results.
    // (a fixed permutation stands in for C#'s seeded Random)
    const toRevert = shuffleResults
      ? results.map((r, i) => [(i * 7919 + 13) % 40, r] as const).sort((a, b) => a[0] - b[0]).map(([, r]) => r)
      : [...results].reverse();

    for (const r of toRevert)
      scoreProcessor.revertResult(r);

    expect(scoreProcessor.combo.value).toBe(0);
    expect(scoreProcessor.highestCombo.value).toBe(0);
  });

  it('applies the score multiplier of the mods, from the difficulty without mods', async () => {
    const mods = [new OsuModHardRock()];

    scoreProcessor = new TestScoreProcessor();
    scoreProcessor.mods.value = mods;

    const workingBeatmap = new TestWorkingBeatmap(beatmap);
    await workingBeatmap.loadBeatmapAsync();
    const playableBeatmap = workingBeatmap.getPlayableBeatmap(new OsuRuleset().rulesetInfo, mods);

    scoreProcessor.applyBeatmap(playableBeatmap);

    scoreProcessor.applyResult(result(beatmap.hitObjects[0], new OsuJudgement(), R.Great));

    expect(Math.abs(scoreProcessor.maximumTotalScore - 1_000_000 * 1.1)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(getDisplayScore(scoreProcessor, ScoringMode.Standardised) - 1_000_000 * 1.1)).toBeLessThanOrEqual(0.5);
  });
});
