// Ported from osu.Game/Overlays/BeatmapListing/SearchExtra.cs

export enum SearchExtra {
  Video,
  Storyboard,
}

/** The [LocalisableDescription] of each value (BeatmapsStrings.Extra*). */
export function getSearchExtraDescription(value: SearchExtra): string {
  switch (value) {
    case SearchExtra.Video: return 'Has Video';
    case SearchExtra.Storyboard: return 'Has Storyboard';
  }
}
