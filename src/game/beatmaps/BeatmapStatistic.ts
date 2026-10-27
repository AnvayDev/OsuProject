// Ported from osu.Game/Beatmaps/BeatmapStatistic.cs, with the osu! ruleset's statistics (osu.Game.Rulesets.Osu/Beatmaps/OsuBeatmap.cs
// GetStatistics) over the object types OsuBeatmapConverter produces: objects with a path become sliders, other objects with a duration
// spinners, and the rest circles. Rulesets other than osu! aren't ported.

import { hasDuration, hasPath } from '../rulesets/objects/types/Types';
import type { IBeatmap } from './Beatmap';

export interface BeatmapStatistic {
  readonly name: string;
  readonly content: string;
  /** The length of a bar which visually represents this statistic's relevance in the beatmap. */
  readonly barDisplayLength: number | null;
}

export function getOsuStatistics(beatmap: IBeatmap): BeatmapStatistic[] {
  const circles = beatmap.hitObjects.filter(h => !hasDuration(h)).length;
  const sliders = beatmap.hitObjects.filter(h => hasPath(h)).length;
  const spinners = beatmap.hitObjects.filter(h => hasDuration(h) && !hasPath(h)).length;
  const sum = Math.max(1, circles + sliders);

  return [
    { name: 'Circles', content: `${circles}`, barDisplayLength: Math.fround(circles / sum) },
    { name: 'Sliders', content: `${sliders}`, barDisplayLength: Math.fround(sliders / sum) },
    { name: 'Spinners', content: `${spinners}`, barDisplayLength: Math.min(Math.fround(spinners / 10), 1) },
  ];
}
