// Ported from osu.Game/Beatmaps/BeatmapUpdater.cs (Process). The online metadata lookup is not ported yet. Star ratings come from that lookup
// rather than a port of the difficulty calculators (no gameplay is ported): until then a beatmap with fewer than two hit objects gets 0, which
// is what osu!'s calculators produce for it, and any other beatmap keeps -1 ("not calculated").
// Process mutates the given set; the importer runs it on the new set before writing it.

import type { BeatmapSetInfo } from './BeatmapSetInfo';
import { updateStatisticsFromBeatmap } from './BeatmapInfoExtensions';
import { MetadataLookupScope } from './MetadataLookupScope';
import type { IWorkingBeatmapCache } from './WorkingBeatmapCache';

/** Handles all processing required to ensure a local beatmap is in a consistent state with any changes. */
export class BeatmapUpdater {
  constructor(private readonly workingBeatmapCache: IWorkingBeatmapCache) {}

  /** Run all processing on a beatmap immediately. */
  async process(beatmapSet: BeatmapSetInfo, _lookupScope = MetadataLookupScope.LocalCacheFirst): Promise<void> {
    // Before we use below, we want to invalidate.
    this.workingBeatmapCache.invalidate(beatmapSet);

    for (const beatmap of beatmapSet.beatmaps) {
      const working = this.workingBeatmapCache.getWorkingBeatmap(beatmap);
      const decoded = (await working.loadBeatmapAsync())!;

      beatmap.starRating = decoded.hitObjects.length < 2 ? 0 : -1;
      updateStatisticsFromBeatmap(beatmap, decoded);
    }

    // And invalidate again afterwards as re-fetching the most up-to-date database metadata will be required.
    this.workingBeatmapCache.invalidate(beatmapSet);
  }
}
