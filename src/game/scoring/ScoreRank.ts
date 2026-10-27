// Ported from osu.Game/Scoring/ScoreRank.cs

export enum ScoreRank {
  // TODO: Localisable?
  F = -1,
  D,
  C,
  B,
  A,
  S,
  SH,
  X,
  XH,
}

/** The values in declaration order (Enum.GetValues). */
export const scoreRankValues = [ScoreRank.F, ScoreRank.D, ScoreRank.C, ScoreRank.B, ScoreRank.A, ScoreRank.S, ScoreRank.SH, ScoreRank.X, ScoreRank.XH];

/** The [LocalisableDescription] of each rank (BeatmapsStrings.Rank*; F has none, so its name). */
export function getScoreRankDescription(value: ScoreRank): string {
  switch (value) {
    case ScoreRank.F: return 'F';
    case ScoreRank.D: return 'D';
    case ScoreRank.C: return 'C';
    case ScoreRank.B: return 'B';
    case ScoreRank.A: return 'A';
    case ScoreRank.S: return 'S';
    case ScoreRank.SH: return 'Silver S';
    case ScoreRank.X: return 'SS';
    case ScoreRank.XH: return 'Silver SS';
  }
}
