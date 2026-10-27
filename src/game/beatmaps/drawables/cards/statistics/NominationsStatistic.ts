// Ported from osu.Game/Beatmaps/Drawables/Cards/Statistics/NominationsStatistic.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { APIBeatmapSet } from '../../../../online/api/requests/responses/APIBeatmapSet';
import { BeatmapCardStatistic } from './BeatmapCardStatistic';

/** Shows the number of current nominations that a map has received, as well as the number of nominations required for qualification. */
export class NominationsStatistic extends BeatmapCardStatistic {
  private constructor(current: number, required: number) {
    super();

    this.icon = FontAwesome.Solid.ThumbsUp;
    this.text = current.toString();
    this.tooltipText = `Nominations: ${current}/${required}`;
  }

  static createFor(beatmapSet: APIBeatmapSet): NominationsStatistic | null {
    // web does not show nominations unless hypes are also present.
    // see: https://github.com/ppy/osu-web/blob/8ed7d071fd1d3eaa7e43cf0e4ff55ca2fef9c07c/resources/assets/lib/beatmapset-panel.tsx#L443
    if (beatmapSet.hypeStatus === null || beatmapSet.nominationStatus === null)
      return null;

    const current = beatmapSet.nominationStatus.current;
    const requiredMainRuleset = beatmapSet.nominationStatus.requiredMeta.mainRuleset;
    const requiredNonMainRuleset = beatmapSet.nominationStatus.requiredMeta.nonMainRuleset;

    const rulesets = new Set(beatmapSet.beatmaps.map(b => b.rulesetID)).size;

    return new NominationsStatistic(current, requiredMainRuleset + requiredNonMainRuleset * (rulesets - 1));
  }
}
