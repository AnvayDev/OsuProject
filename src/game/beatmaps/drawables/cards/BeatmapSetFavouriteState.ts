// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapSetFavouriteState.cs

/** Stores the current favourite state of a beatmap set. Used to coordinate between FavouriteButton and FavouritesStatistic. */
export interface BeatmapSetFavouriteState {
  /** Whether the currently logged-in user has favourited this beatmap. */
  readonly favourited: boolean;

  /** The number of favourites that the beatmap set has received, including the currently logged-in user. */
  readonly favouriteCount: number;
}
