// Ported from osu.Game/Beatmaps/BeatmapInfoExtensions.cs (UpdateStatisticsFromBeatmap, GetDisplayTitle, Match, AllowGameplayWithRuleset).

import { hasDuration } from '../rulesets/objects/types/Types';
import { BeatmapExtensions, type IBeatmap } from './Beatmap';
import type { BeatmapInfo } from './BeatmapInfo';
import type { RulesetInfo } from '../rulesets/RulesetInfo';
import type { OptionalTextFilter } from '../screens/select/FilterCriteria';
import { getDisplayTitle as getMetadataDisplayTitle, match as matchMetadata } from './BeatmapMetadataInfoExtensions';

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

export function match(beatmapInfo: BeatmapInfo, filters: readonly OptionalTextFilter[]): boolean {
  for (const filter of filters) {
    if (filter.matches(beatmapInfo.difficultyName))
      continue;

    if (matchMetadata(beatmapInfo.metadata, filter))
      continue;

    // failed to match a single filter at all - fail the whole match.
    return false;
  }

  // got through all filters without failing any - pass the whole match.
  return true;
}

/** Whether gameplay is allowed for this beatmap with the provided ruleset (via conversion or direct compatibility). */
export function allowGameplayWithRuleset(beatmap: BeatmapInfo, ruleset: RulesetInfo, allowConversion: boolean): boolean {
  if (beatmap.ruleset.shortName === ruleset.shortName)
    return true;

  if (allowConversion && beatmap.ruleset.onlineID === 0 && ruleset.onlineID !== 0)
    return true;

  return false;
}
