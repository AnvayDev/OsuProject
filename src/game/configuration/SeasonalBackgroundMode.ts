// Ported from osu.Game/Configuration/SeasonalBackgroundMode.cs (string-valued so the stored setting is its name, as in C#).

export enum SeasonalBackgroundMode {
  /** Seasonal backgrounds are shown regardless of season, if at all available. */
  Always = 'Always',

  /** Seasonal backgrounds are shown only during their corresponding season. */
  Sometimes = 'Sometimes',

  /** Seasonal backgrounds are never shown. */
  Never = 'Never',
}
