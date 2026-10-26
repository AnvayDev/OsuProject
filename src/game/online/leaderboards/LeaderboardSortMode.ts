// Ported from osu.Game/Online/Leaderboards/LeaderboardSortMode.cs (string-valued so the stored setting is its name, as in C#).

export enum LeaderboardSortMode {
  Score = 'Score',
  Accuracy = 'Accuracy',
  MaxCombo = 'MaxCombo',
  Misses = 'Misses',
  Date = 'Date',
}

/** The [LocalisableDescription] of each mode (BeatmapLeaderboardWedgeStrings). */
export function getLeaderboardSortModeDescription(mode: LeaderboardSortMode): string {
  switch (mode) {
    case LeaderboardSortMode.Score: return 'Score';
    case LeaderboardSortMode.Accuracy: return 'Accuracy';
    case LeaderboardSortMode.MaxCombo: return 'Max Combo';
    case LeaderboardSortMode.Misses: return 'Misses';
    case LeaderboardSortMode.Date: return 'Date';
  }
}
