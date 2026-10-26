// Ported from osu.Game/Beatmaps/Drawables/Cards/Statistics/HypesStatistic.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { APIBeatmapSet, BeatmapSetHypeStatus } from '../../../../online/api/requests/responses/APIBeatmapSet';
import { BeatmapCardStatistic } from './BeatmapCardStatistic';

/** Shows the number of current hypes that a map has received, as well as the number of hypes required for nomination. */
export class HypesStatistic extends BeatmapCardStatistic {
  private constructor(hypeStatus: BeatmapSetHypeStatus) {
    super();

    this.icon = FontAwesome.Solid.Bullhorn;
    this.text = hypeStatus.current.toString();
    this.tooltipText = `Hype: ${hypeStatus.current}/${hypeStatus.required}`;
  }

  static createFor(beatmapSetOnlineInfo: APIBeatmapSet): HypesStatistic | null {
    return beatmapSetOnlineInfo.hypeStatus === null ? null : new HypesStatistic(beatmapSetOnlineInfo.hypeStatus);
  }
}
