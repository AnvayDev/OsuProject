// Ported from osu.Game/Beatmaps/Drawables/Cards/Statistics/BeatmapCardDateStatistic.cs (the DateTooltip isn't ported yet).

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { APIBeatmapSet } from '../../../../online/api/requests/responses/APIBeatmapSet';
import { toLocalisedMediumDate } from '../../../../utils/FormatUtils';
import { BeatmapOnlineStatus } from '../../../BeatmapOnlineStatus';
import { BeatmapCardStatistic } from './BeatmapCardStatistic';

export class BeatmapCardDateStatistic extends BeatmapCardStatistic {
  readonly dateTime: Date;

  private constructor(dateTime: Date) {
    super();

    this.dateTime = dateTime;

    this.icon = FontAwesome.Solid.CheckCircle;
    this.text = toLocalisedMediumDate(dateTime);
  }

  static createFor(beatmapSetInfo: APIBeatmapSet): BeatmapCardDateStatistic | null {
    const displayDate = displayDateFor(beatmapSetInfo);

    if (displayDate === null)
      return null;

    return new BeatmapCardDateStatistic(displayDate);
  }
}

function displayDateFor(beatmapSetInfo: APIBeatmapSet): Date | null {
  // reference: https://github.com/ppy/osu-web/blob/ef432c11719fd1207bec5f9194b04f0033bdf02c/resources/assets/lib/beatmapset-panel.tsx#L36-L44
  switch (beatmapSetInfo.status) {
    case BeatmapOnlineStatus.Ranked:
    case BeatmapOnlineStatus.Approved:
    case BeatmapOnlineStatus.Loved:
    case BeatmapOnlineStatus.Qualified:
      return beatmapSetInfo.ranked;

    default:
      return beatmapSetInfo.lastUpdated;
  }
}
