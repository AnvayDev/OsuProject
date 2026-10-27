// Ported from osu.Game/Overlays/BeatmapListing/SortCriteria.cs

export enum SortCriteria {
  Title,
  Artist,
  Difficulty,
  Updated,
  Ranked,
  Rating,
  Plays,
  Favourites,
  Relevance,
  Nominations,
}

/** The [LocalisableDescription] of each criteria (BeatmapsStrings.ListingSearchSorting*). */
export function getSortCriteriaDescription(value: SortCriteria): string {
  switch (value) {
    case SortCriteria.Title: return 'Title';
    case SortCriteria.Artist: return 'Artist';
    case SortCriteria.Difficulty: return 'Difficulty';
    case SortCriteria.Updated: return 'Updated';
    case SortCriteria.Ranked: return 'Ranked';
    case SortCriteria.Rating: return 'Rating';
    case SortCriteria.Plays: return 'Plays';
    case SortCriteria.Favourites: return 'Favourites';
    case SortCriteria.Relevance: return 'Relevance';
    case SortCriteria.Nominations: return 'Nominations';
  }
}
