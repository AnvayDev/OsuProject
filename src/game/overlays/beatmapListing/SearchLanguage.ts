// Ported from osu.Game/Overlays/BeatmapListing/SearchLanguage.cs

export enum SearchLanguage {
  Any,
  Unspecified,
  English,
  Japanese,
  Chinese,
  Instrumental,
  Korean,
  French,
  German,
  Swedish,
  Spanish,
  Italian,
  Russian,
  Polish,
  Other,
}

/** The values sorted by their [Order] attribute (EnumExtensions.GetValuesInOrder on a [HasOrderedElements] enum). */
export const searchLanguageValues = [SearchLanguage.Any, SearchLanguage.English, SearchLanguage.Chinese, SearchLanguage.French, SearchLanguage.German,
  SearchLanguage.Italian, SearchLanguage.Japanese, SearchLanguage.Korean, SearchLanguage.Spanish, SearchLanguage.Swedish, SearchLanguage.Russian,
  SearchLanguage.Polish, SearchLanguage.Instrumental, SearchLanguage.Other, SearchLanguage.Unspecified];

/** The [LocalisableDescription] of each language (BeatmapsStrings.Language*). */
export function getSearchLanguageDescription(value: SearchLanguage): string {
  switch (value) {
    case SearchLanguage.Any: return 'Any';
    case SearchLanguage.Unspecified: return 'Unspecified';
    case SearchLanguage.English: return 'English';
    case SearchLanguage.Japanese: return 'Japanese';
    case SearchLanguage.Chinese: return 'Chinese';
    case SearchLanguage.Instrumental: return 'Instrumental';
    case SearchLanguage.Korean: return 'Korean';
    case SearchLanguage.French: return 'French';
    case SearchLanguage.German: return 'German';
    case SearchLanguage.Swedish: return 'Swedish';
    case SearchLanguage.Spanish: return 'Spanish';
    case SearchLanguage.Italian: return 'Italian';
    case SearchLanguage.Russian: return 'Russian';
    case SearchLanguage.Polish: return 'Polish';
    case SearchLanguage.Other: return 'Other';
  }
}
