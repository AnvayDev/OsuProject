// Ported from osu.Game/Overlays/BeatmapListing/SearchExplicit.cs

export enum SearchExplicit {
  Hide,
  Show,
}

/** The [LocalisableDescription] of each value (BeatmapsStrings.Nsfw*). */
export function getSearchExplicitDescription(value: SearchExplicit): string {
  switch (value) {
    case SearchExplicit.Hide: return 'Hide';
    case SearchExplicit.Show: return 'Show';
  }
}
