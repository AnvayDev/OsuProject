// Ported from osu.Game/Screens/Select/Filter/GroupMode.cs (string-valued so the stored setting is its name, as in C#).

export enum GroupMode {
  None = 'None',
  Artist = 'Artist',
  Author = 'Author',
  BPM = 'BPM',
  Collections = 'Collections',
  DateAdded = 'DateAdded',
  DateRanked = 'DateRanked',
  Difficulty = 'Difficulty',
  Favourites = 'Favourites',
  LastPlayed = 'LastPlayed',
  Length = 'Length',
  MyMaps = 'MyMaps',
  RankAchieved = 'RankAchieved',
  RankedStatus = 'RankedStatus',
  Source = 'Source',
  Title = 'Title',
  Variant = 'Variant',
}

/** The [LocalisableDescription] of each mode (SongSelectStrings). Variant has none (its text is the ruleset's VariantDescription). */
export function getGroupModeDescription(mode: GroupMode): string {
  switch (mode) {
    case GroupMode.None: return 'None';
    case GroupMode.Artist: return 'Artist';
    case GroupMode.Author: return 'Author';
    case GroupMode.BPM: return 'BPM';
    case GroupMode.Collections: return 'Collections';
    case GroupMode.DateAdded: return 'Date Added';
    case GroupMode.DateRanked: return 'Date Ranked';
    case GroupMode.Difficulty: return 'Difficulty';
    case GroupMode.Favourites: return 'Favourites';
    case GroupMode.LastPlayed: return 'Last Played';
    case GroupMode.Length: return 'Length';
    case GroupMode.MyMaps: return 'My Maps';
    case GroupMode.RankAchieved: return 'Rank Achieved';
    case GroupMode.RankedStatus: return 'Ranked Status';
    case GroupMode.Source: return 'Source';
    case GroupMode.Title: return 'Title';
    case GroupMode.Variant: return 'Variant';
  }
}
