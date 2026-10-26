// Ported from osu.Game/Beatmaps/BeatmapUpdaterMetadataLookup.cs
// The local cache source (LocalCachedBeatmapMetadataSource, a downloaded sqlite snapshot of osu-web) isn't available on the web, so lookups
// always go to the online source (MirrorBeatmapMetadataSource). Lookups are asynchronous (C# blocks); a set's beatmaps are looked up in turn,
// as C# does. update() returns the looked-up star ratings for BeatmapUpdater (see OnlineBeatmapMetadata.starRating).

import type { BeatmapInfo } from './BeatmapInfo';
import type { BeatmapSetInfo } from './BeatmapSetInfo';
import { BeatmapOnlineStatus } from './BeatmapOnlineStatus';
import { MirrorBeatmapMetadataSource } from './MirrorBeatmapMetadataSource';
import type { OnlineBeatmapMetadata } from './OnlineBeatmapMetadata';

/** A component which handles population of online IDs for beatmaps using a two part lookup procedure. */
export class BeatmapUpdaterMetadataLookup {
  constructor(private readonly apiMetadataSource: Pick<MirrorBeatmapMetadataSource, 'tryLookup'> = new MirrorBeatmapMetadataSource()) {}

  /** Queue an update for a beatmap set. Updates are applied directly to the given set. */
  async update(beatmapSet: BeatmapSetInfo, _preferOnlineFetch: boolean): Promise<Map<BeatmapInfo, number>> {
    const lookupResults: (OnlineBeatmapMetadata | null)[] = [];
    const starRatings = new Map<BeatmapInfo, number>();

    for (const beatmapInfo of beatmapSet.beatmaps) {
      // note that these lookups DO NOT ACTUALLY FULLY GUARANTEE that the beatmap is what it claims it is,
      // i.e. the correctness of this lookup should be treated as APPROXIMATE AT WORST.
      //
      // additionally note that the online ID stored to the map is EXPLICITLY NOT USED because some users in a silly attempt to "fix" things for themselves on stable
      // would reuse online IDs of already submitted beatmaps, which means that information is pretty much expected to be bogus in a nonzero number of beatmapsets.
      const lookup = await this.apiMetadataSource.tryLookup(beatmapInfo);

      if (lookup === null)
        continue;

      const res = lookup.onlineMetadata;

      if (res === null) {
        beatmapInfo.resetOnlineInfo();
        lookupResults.push(null); // mark lookup failure
        continue;
      }

      lookupResults.push(res);

      beatmapInfo.onlineID = res.beatmapID;
      beatmapInfo.onlineMD5Hash = res.md5Hash;
      beatmapInfo.lastOnlineUpdate = res.lastUpdated;

      beatmapInfo.beatmapSet!.onlineID = res.beatmapSetID;

      // Some metadata should only be applied if there's no local changes.
      if (beatmapInfo.matchesOnlineVersion) {
        beatmapInfo.status = res.beatmapStatus;
        beatmapInfo.metadata.author.onlineID = res.authorID;
        beatmapInfo.metadata.userTags = [...res.userTags];
        starRatings.set(beatmapInfo, res.starRating);
      }
    }

    if (beatmapSet.beatmaps.every(b => b.matchesOnlineVersion)
      && lookupResults.every(r => r !== null)
      && new Set(lookupResults.map(r => r!.beatmapSetID)).size === 1) {
      const representative = lookupResults[0]!;

      beatmapSet.status = representative.beatmapSetStatus ?? BeatmapOnlineStatus.None;
      beatmapSet.dateRanked = representative.dateRanked;
      beatmapSet.dateSubmitted = representative.dateSubmitted;
    }

    return starRatings;
  }
}
