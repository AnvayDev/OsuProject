// Ported from osu.Game/Beatmaps/BeatmapInfoExtensions.cs (UpdateStatisticsFromBeatmap, GetDisplayTitle).

import { hasDuration } from '../rulesets/objects/types/Types';
import { BeatmapExtensions, type IBeatmap } from './Beatmap';
import type { BeatmapInfo } from './BeatmapInfo';
import { getDisplayTitle as getMetadataDisplayTitle } from './BeatmapMetadataInfoExtensions';

/** Given an IBeatmap, update length, BPM and object counts. */
export function updateStatisticsFromBeatmap(beatmapInfo: BeatmapInfo, beatmap: IBeatmap): void {
  beatmapInfo.length = BeatmapExtensions.calculatePlayableLength(beatmap);
  beatmapInfo.bpm = 60000 / beatmap.getMostCommonBeatLength();
  beatmapInfo.endTimeObjectCount = beatmap.hitObjects.filter(h => hasDuration(h)).length;
  beatmapInfo.totalObjectCount = beatmap.hitObjects.length;
}

/** A user-presentable display title representing this beatmap. */
export function getDisplayTitle(beatmapInfo: BeatmapInfo): string {
  return `${getMetadataDisplayTitle(beatmapInfo.metadata)} ${getVersionString(beatmapInfo)}`.trim();
}

function getVersionString(beatmapInfo: BeatmapInfo): string {
  return !beatmapInfo.difficultyName ? '' : `[${beatmapInfo.difficultyName}]`;
}
