// Ported from osu.Game/Screens/Play/Leaderboards/BeatmapLeaderboardScope.cs

export enum BeatmapLeaderboardScope {
  Local,
  Global,
  Country,
  Friend,
  Team,
}

/** The [LocalisableDescription] of each scope (BeatmapLeaderboardWedgeStrings). */
export function getBeatmapLeaderboardScopeDescription(scope: BeatmapLeaderboardScope): string {
  switch (scope) {
    case BeatmapLeaderboardScope.Local: return 'Local';
    case BeatmapLeaderboardScope.Global: return 'Global';
    case BeatmapLeaderboardScope.Country: return 'Country';
    case BeatmapLeaderboardScope.Friend: return 'Friend';
    case BeatmapLeaderboardScope.Team: return 'Team';
  }
}
