// Ported from osu.Game/Overlays/BeatmapListing/SearchGeneral.cs

export enum SearchGeneral {
  Recommended,
  Converts,
  Follows,
  Spotlights,
  FeaturedArtists,
}

/** The [LocalisableDescription] of each value (BeatmapsStrings.General*). */
export function getSearchGeneralDescription(value: SearchGeneral): string {
  switch (value) {
    case SearchGeneral.Recommended: return 'Recommended difficulty';
    case SearchGeneral.Converts: return 'Include converted beatmaps';
    case SearchGeneral.Follows: return 'Subscribed mappers';
    case SearchGeneral.Spotlights: return 'Spotlighted beatmaps';
    case SearchGeneral.FeaturedArtists: return 'Featured Artists';
  }
}
