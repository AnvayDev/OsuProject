// Ported from osu.Game/Beatmaps/StarDifficulty.cs
// Difficulty and performance attributes aren't ported (no difficulty calculators). A record struct: compare with starDifficultyEquals.

export interface StarDifficulty {
  /** The star difficulty rating for the given beatmap. */
  readonly stars: number;

  /** The maximum combo achievable on the given beatmap. */
  readonly maxCombo: number;
}

export function starDifficultyEquals(a: StarDifficulty, b: StarDifficulty): boolean {
  return a.stars === b.stars && a.maxCombo === b.maxCombo;
}
