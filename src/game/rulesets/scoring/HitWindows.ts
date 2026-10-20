// Ported from osu.Game/Rulesets/Scoring/HitWindows.cs and DefaultHitWindows.cs

import { BeatmapDifficultyInfo } from '../../beatmaps/BeatmapDifficulty';
import { HitResult } from './HitResult';

/** A structure containing timing data for hit window based gameplay. */
export abstract class HitWindows {
  /** An empty HitWindows with only HitResult.Miss and HitResult.Perfect. No time values are provided (meaning instantaneous hit or miss). */
  static readonly Empty: HitWindows = new (class EmptyHitWindows extends HitWindows {
    override isHitResultAllowed(_result: HitResult): boolean { return true; }
    override setDifficulty(_difficulty: number): void { }
    override windowFor(_result: HitResult): number { return 0; }
  })();

  /** Retrieves the HitResult with the largest hit window that produces a successful hit. */
  protected lowestSuccessfulHitResult(): HitResult {
    for (let result = HitResult.Meh; result <= HitResult.Perfect; ++result) {
      if (this.isHitResultAllowed(result))
        return result;
    }

    return HitResult.None;
  }

  /** Retrieves a mapping of HitResults to their timing windows for all allowed HitResults. */
  *getAllAvailableWindows(): Iterable<[HitResult, number]> {
    for (let result = HitResult.Miss; result <= HitResult.Perfect; ++result) {
      if (this.isHitResultAllowed(result))
        yield [result, this.windowFor(result)];
    }
  }

  /** Check whether it is possible to achieve the provided HitResult. */
  isHitResultAllowed(_result: HitResult): boolean {
    return true;
  }

  /** Sets hit windows with values that correspond to a difficulty parameter. */
  abstract setDifficulty(difficulty: number): void;

  /** Retrieves the HitResult for a time offset. */
  resultFor(timeOffset: number): HitResult {
    timeOffset = Math.abs(timeOffset);

    for (let result = HitResult.Perfect; result >= HitResult.Miss; --result) {
      if (this.isHitResultAllowed(result) && timeOffset <= this.windowFor(result))
        return result;
    }

    return HitResult.None;
  }

  /** Retrieves the hit window for a HitResult. This is the number of +/- milliseconds allowed for the requested result (so the actual hittable range is double this). */
  abstract windowFor(result: HitResult): number;

  /** Given a time offset, whether the HitObject can ever be hit in the future with a non-HitResult.Miss result. This happens if timeOffset is less than what is required for lowestSuccessfulHitResult. */
  canBeHit(timeOffset: number): boolean {
    return timeOffset <= this.windowFor(this.lowestSuccessfulHitResult());
  }
}

/** An implementation of HitWindows which can be used for rulesets without bespoke windows. */
export class DefaultHitWindows extends HitWindows {
  private static readonly perfect_window_range = { min: 22.4, mid: 19.4, max: 13.9 };
  private static readonly great_window_range = { min: 64, mid: 49, max: 34 };
  private static readonly good_window_range = { min: 97, mid: 82, max: 67 };
  private static readonly ok_window_range = { min: 127, mid: 112, max: 97 };
  private static readonly meh_window_range = { min: 151, mid: 136, max: 121 };
  private static readonly miss_window_range = { min: 188, mid: 173, max: 158 };

  private perfect = 0;
  private great = 0;
  private good = 0;
  private ok = 0;
  private meh = 0;
  private miss = 0;

  override setDifficulty(difficulty: number): void {
    this.perfect = BeatmapDifficultyInfo.difficultyRange(difficulty, DefaultHitWindows.perfect_window_range);
    this.great = BeatmapDifficultyInfo.difficultyRange(difficulty, DefaultHitWindows.great_window_range);
    this.good = BeatmapDifficultyInfo.difficultyRange(difficulty, DefaultHitWindows.good_window_range);
    this.ok = BeatmapDifficultyInfo.difficultyRange(difficulty, DefaultHitWindows.ok_window_range);
    this.meh = BeatmapDifficultyInfo.difficultyRange(difficulty, DefaultHitWindows.meh_window_range);
    this.miss = BeatmapDifficultyInfo.difficultyRange(difficulty, DefaultHitWindows.miss_window_range);
  }

  override windowFor(result: HitResult): number {
    switch (result) {
      case HitResult.Perfect: return this.perfect;
      case HitResult.Great: return this.great;
      case HitResult.Good: return this.good;
      case HitResult.Ok: return this.ok;
      case HitResult.Meh: return this.meh;
      case HitResult.Miss: return this.miss;
      default: throw new RangeError(`result (${HitResult[result]})`);
    }
  }
}
