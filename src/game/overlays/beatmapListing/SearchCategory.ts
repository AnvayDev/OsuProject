// Ported from osu.Game/Overlays/BeatmapListing/SearchCategory.cs

export enum SearchCategory {
  Any,
  Leaderboard,
  Ranked,
  Qualified,
  Loved,
  Favourites,
  Pending,
  Wip,
  Graveyard,
  Mine,
}

/** The [LocalisableDescription] of each category (BeatmapsStrings.Status*). */
export function getSearchCategoryDescription(value: SearchCategory): string {
  switch (value) {
    case SearchCategory.Any: return 'Any';
    case SearchCategory.Leaderboard: return 'Has Leaderboard';
    case SearchCategory.Ranked: return 'Ranked';
    case SearchCategory.Qualified: return 'Qualified';
    case SearchCategory.Loved: return 'Loved';
    case SearchCategory.Favourites: return 'Favourites';
    case SearchCategory.Pending: return 'Pending';
    case SearchCategory.Wip: return 'WIP';
    case SearchCategory.Graveyard: return 'Graveyard';
    case SearchCategory.Mine: return 'My Maps';
  }
}
