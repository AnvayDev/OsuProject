// Ported from osu.Game/Online/Leaderboards/LeaderboardState.cs (with LeaderboardFailState's values from LeaderboardManager.cs).

export enum LeaderboardState {
  Success = 0,
  Retrieving = 1,
  NoScores = 2,

  NetworkFailure = -1,
  BeatmapUnavailable = -2,
  RulesetUnavailable = -3,
  NoneSelected = -4,
  NotLoggedIn = -5,
  NotSupporter = -6,
  NoTeam = -7,
}
