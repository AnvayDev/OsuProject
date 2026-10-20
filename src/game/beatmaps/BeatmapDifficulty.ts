// Ported from osu.Game/Beatmaps/BeatmapDifficulty.cs and IBeatmapDifficultyInfo.cs.
// DrainRate/CircleSize/OverallDifficulty/ApproachRate are C# floats: values assigned to them are single-precision (see Parsing.parseFloat).

export interface IBeatmapDifficultyInfo {
  readonly drainRate: number;
  readonly circleSize: number;
  readonly overallDifficulty: number;
  readonly approachRate: number;
  readonly sliderMultiplier: number;
  readonly sliderTickRate: number;
}

export interface DifficultyRange {
  readonly min: number;
  readonly mid: number;
  readonly max: number;
}

/** The static helpers of IBeatmapDifficultyInfo. */
export const BeatmapDifficultyInfo = {
  /** The default value used for all difficulty settings except SliderMultiplier and SliderTickRate. */
  DEFAULT_DIFFICULTY: 5,

  /** Maps a difficulty value [0, 10] to a two-piece linear range of values (min at 0, mid at 5, max at 10). */
  difficultyRange(difficulty: number, min: number | DifficultyRange, mid?: number, max?: number): number {
    if (typeof min !== 'number')
      return BeatmapDifficultyInfo.difficultyRange(difficulty, min.min, min.mid, min.max);

    if (difficulty > 5)
      return mid! + (max! - mid!) * BeatmapDifficultyInfo.normalisedDifficulty(difficulty);
    if (difficulty < 5)
      return mid! + (mid! - min) * BeatmapDifficultyInfo.normalisedDifficulty(difficulty);

    return mid!;
  },

  /** DifficultyRange(double difficulty): maps [0, 10] to [-1, 1]. */
  normalisedDifficulty(difficulty: number): number {
    return (difficulty - 5) / 5;
  },

  difficultyRangeInt(difficulty: number, range: DifficultyRange): number {
    return Math.trunc(BeatmapDifficultyInfo.difficultyRange(difficulty, range.min, range.mid, range.max));
  },

  /** Inverse function to difficultyRange: maps a value returned by the function above back to the difficulty that produced it. */
  inverseDifficultyRange(difficultyValue: number, diff0: number | DifficultyRange, diff5?: number, diff10?: number): number {
    if (typeof diff0 !== 'number')
      return BeatmapDifficultyInfo.inverseDifficultyRange(difficultyValue, diff0.min, diff0.mid, diff0.max);

    return Math.sign(difficultyValue - diff5!) === Math.sign(diff10! - diff5!)
      ? (difficultyValue - diff5!) / (diff10! - diff5!) * 5 + 5
      : (difficultyValue - diff5!) / (diff5! - diff0) * 5 + 5;
  },
};

export class BeatmapDifficulty implements IBeatmapDifficultyInfo {
  static readonly DEFAULT_DIFFICULTY = 5;

  drainRate = BeatmapDifficultyInfo.DEFAULT_DIFFICULTY;
  circleSize = BeatmapDifficultyInfo.DEFAULT_DIFFICULTY;
  overallDifficulty = BeatmapDifficultyInfo.DEFAULT_DIFFICULTY;
  approachRate = BeatmapDifficultyInfo.DEFAULT_DIFFICULTY;

  sliderMultiplier = 1.4;
  sliderTickRate = 1;

  constructor(source: IBeatmapDifficultyInfo | null = null) {
    if (source !== null)
      this.copyFrom(source);
  }

  /** Returns a shallow-clone of this BeatmapDifficulty. */
  clone(): BeatmapDifficulty {
    return new BeatmapDifficulty(this);
  }

  copyTo(difficulty: BeatmapDifficulty): void {
    difficulty.approachRate = this.approachRate;
    difficulty.drainRate = this.drainRate;
    difficulty.circleSize = this.circleSize;
    difficulty.overallDifficulty = this.overallDifficulty;

    difficulty.sliderMultiplier = this.sliderMultiplier;
    difficulty.sliderTickRate = this.sliderTickRate;
  }

  copyFrom(other: IBeatmapDifficultyInfo): void {
    this.approachRate = other.approachRate;
    this.drainRate = other.drainRate;
    this.circleSize = other.circleSize;
    this.overallDifficulty = other.overallDifficulty;

    this.sliderMultiplier = other.sliderMultiplier;
    this.sliderTickRate = other.sliderTickRate;
  }
}
