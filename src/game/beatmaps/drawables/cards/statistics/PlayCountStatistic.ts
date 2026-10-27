// Ported from osu.Game/Beatmaps/Drawables/Cards/Statistics/PlayCountStatistic.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { APIBeatmapSet } from '../../../../online/api/requests/responses/APIBeatmapSet';
import { toMetric } from '../../../../utils/HumanizerUtils';
import { BeatmapCardStatistic } from './BeatmapCardStatistic';

/** Shows the number of times the given beatmap set has been played. */
export class PlayCountStatistic extends BeatmapCardStatistic {
  constructor(onlineInfo: APIBeatmapSet) {
    super();

    this.icon = FontAwesome.Solid.PlayCircle;
    this.text = toMetric(onlineInfo.playCount, 1);
    this.tooltipText = `Playcount: ${onlineInfo.playCount.toLocaleString('en-US')}`;
  }
}
