// Ported from osu.Game/Overlays/BeatmapListing/SearchPlayed.cs

export enum SearchPlayed {
  Any,
  Played,
  Unplayed,
}

/** The [LocalisableDescription] of each value (BeatmapsStrings.Played*). */
export function getSearchPlayedDescription(value: SearchPlayed): string {
  switch (value) {
    case SearchPlayed.Any: return 'Any';
    case SearchPlayed.Played: return 'Played';
    case SearchPlayed.Unplayed: return 'Unplayed';
  }
}
