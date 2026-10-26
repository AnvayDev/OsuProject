// Ported from osu.Game/Screens/Select/PanelLocalRankDisplay.cs
// Offline port with no local scores: the subscription to the realm's scores is never made and there is never a rank to show, so the
// UpdateableRank child (always at alpha 0) is left out. What remains is the empty auto-sized drawable that the panels' fill flows space around.

import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Axes } from '@fw/layout/Enums';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';

export class PanelLocalRankDisplay extends CompositeDrawable {
  beatmap: BeatmapInfo | null = null;

  get hasRank(): boolean {
    return false;
  }

  constructor() {
    super();

    this.autoSizeAxes = Axes.Both;
  }
}
