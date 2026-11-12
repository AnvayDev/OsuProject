// Ported from osu.Game.Rulesets.Osu/Scoring/OsuHitWindows.cs

import { BeatmapDifficultyInfo, type DifficultyRange } from '../../../beatmaps/BeatmapDifficulty';
import { HitResult } from '../../scoring/HitResult';
import { HitWindows } from '../../scoring/HitWindows';

export class OsuHitWindows extends HitWindows {
  static readonly GREAT_WINDOW_RANGE: DifficultyRange = { min: 80, mid: 50, max: 20 };
  static readonly OK_WINDOW_RANGE: DifficultyRange = { min: 140, mid: 100, max: 60 };
  static readonly MEH_WINDOW_RANGE: DifficultyRange = { min: 200, mid: 150, max: 100 };

  /** osu! ruleset has a fixed miss window regardless of difficulty settings. */
  static readonly MISS_WINDOW = 400;

  private great = 0;
  private ok = 0;
  private meh = 0;

  override isHitResultAllowed(result: HitResult): boolean {
    switch (result) {
      case HitResult.Great:
      case HitResult.Ok:
      case HitResult.Meh:
      case HitResult.Miss:
        return true;
    }

    return false;
  }

  override setDifficulty(difficulty: number): void {
    this.great = Math.floor(BeatmapDifficultyInfo.difficultyRange(difficulty, OsuHitWindows.GREAT_WINDOW_RANGE)) - 0.5;
    this.ok = Math.floor(BeatmapDifficultyInfo.difficultyRange(difficulty, OsuHitWindows.OK_WINDOW_RANGE)) - 0.5;
    this.meh = Math.floor(BeatmapDifficultyInfo.difficultyRange(difficulty, OsuHitWindows.MEH_WINDOW_RANGE)) - 0.5;
  }

  override windowFor(result: HitResult): number {
    switch (result) {
      case HitResult.Great:
        return this.great;

      case HitResult.Ok:
        return this.ok;

      case HitResult.Meh:
        return this.meh;

      case HitResult.Miss:
        return OsuHitWindows.MISS_WINDOW;

      default:
        throw new RangeError(`result (${HitResult[result]})`);
    }
  }
}
