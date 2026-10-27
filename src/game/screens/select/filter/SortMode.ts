// Ported from osu.Game/Screens/Select/Filter/SortMode.cs (string-valued so the stored setting is its name, as in C#).

export enum SortMode {
  Artist = 'Artist',
  Author = 'Author',
  BPM = 'BPM',
  DateAdded = 'DateAdded',
  DateRanked = 'DateRanked',
  DateSubmitted = 'DateSubmitted',
  Difficulty = 'Difficulty',
  LastPlayed = 'LastPlayed',
  Length = 'Length',
  Source = 'Source',
  Title = 'Title',
}

/** The [LocalisableDescription] of each mode (SongSelectStrings). */
export function getSortModeDescription(mode: SortMode): string {
  switch (mode) {
    case SortMode.Artist: return 'Artist';
    case SortMode.Author: return 'Author';
    case SortMode.BPM: return 'BPM';
    case SortMode.DateAdded: return 'Date Added';
    case SortMode.DateRanked: return 'Date Ranked';
    case SortMode.DateSubmitted: return 'Date Submitted';
    case SortMode.Difficulty: return 'Difficulty';
    case SortMode.LastPlayed: return 'Last Played';
    case SortMode.Length: return 'Length';
    case SortMode.Source: return 'Source';
    case SortMode.Title: return 'Title';
  }
}
