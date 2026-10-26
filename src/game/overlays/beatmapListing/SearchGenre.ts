// Ported from osu.Game/Overlays/BeatmapListing/SearchGenre.cs

export enum SearchGenre {
  Any = 0,
  Unspecified = 1,
  VideoGame = 2,
  Anime = 3,
  Rock = 4,
  Pop = 5,
  Other = 6,
  Novelty = 7,
  HipHop = 9,
  Electronic = 10,
  Metal = 11,
  Classical = 12,
  Folk = 13,
  Jazz = 14,
}

/** The values in declaration order (EnumExtensions.GetValuesInOrder). */
export const searchGenreValues = [SearchGenre.Any, SearchGenre.Unspecified, SearchGenre.VideoGame, SearchGenre.Anime, SearchGenre.Rock, SearchGenre.Pop,
  SearchGenre.Other, SearchGenre.Novelty, SearchGenre.HipHop, SearchGenre.Electronic, SearchGenre.Metal, SearchGenre.Classical, SearchGenre.Folk,
  SearchGenre.Jazz];

/** The [LocalisableDescription] of each genre (BeatmapsStrings.Genre*). */
export function getSearchGenreDescription(value: SearchGenre): string {
  switch (value) {
    case SearchGenre.Any: return 'Any';
    case SearchGenre.Unspecified: return 'Unspecified';
    case SearchGenre.VideoGame: return 'Video Game';
    case SearchGenre.Anime: return 'Anime';
    case SearchGenre.Rock: return 'Rock';
    case SearchGenre.Pop: return 'Pop';
    case SearchGenre.Other: return 'Other';
    case SearchGenre.Novelty: return 'Novelty';
    case SearchGenre.HipHop: return 'Hip Hop';
    case SearchGenre.Electronic: return 'Electronic';
    case SearchGenre.Metal: return 'Metal';
    case SearchGenre.Classical: return 'Classical';
    case SearchGenre.Folk: return 'Folk';
    case SearchGenre.Jazz: return 'Jazz';
  }
}
