// Ported from osu.Game/Beatmaps/MetadataLookupScope.cs

/** Determines which sources (if any at all) should be queried in which order for a beatmap's metadata. */
export enum MetadataLookupScope {
  /** Do not attempt to look up the beatmap metadata either in the local cache or online. */
  None,

  /** Try the local metadata cache first before querying online sources. */
  LocalCacheFirst,

  /** Query online sources immediately. */
  OnlineFirst,
}
