// Ported from osu.Game/Overlays/BeatmapListing/BeatmapSearchScoreFilterRow.cs

import { getScoreRankDescription, ScoreRank, scoreRankValues } from '../../scoring/ScoreRank';
import type { FilterValues } from './BeatmapSearchFilterRow';
import { BeatmapSearchMultipleSelectionFilterRow, MultipleSelectionFilter, MultipleSelectionFilterTabItem } from './BeatmapSearchMultipleSelectionFilterRow';

export class BeatmapSearchScoreFilterRow extends BeatmapSearchMultipleSelectionFilterRow<ScoreRank> {
  constructor() {
    super('Rank Achieved', { values: scoreRankValues, describe: getScoreRankDescription });
  }

  protected override createMultipleSelectionFilter(filterValues: FilterValues<ScoreRank>): MultipleSelectionFilter<ScoreRank> {
    return new RankFilter(filterValues);
  }
}

/** (BeatmapSearchScoreFilterRow.RankFilter) */
class RankFilter extends MultipleSelectionFilter<ScoreRank> {
  protected override createTabItem(value: ScoreRank): MultipleSelectionFilterTabItem<ScoreRank> {
    // (RankItem: the label is the rank's description)
    return new MultipleSelectionFilterTabItem<ScoreRank>(value, getScoreRankDescription);
  }

  protected override getValues(): readonly ScoreRank[] {
    return super.getValues().filter(r => r > ScoreRank.F).reverse();
  }
}
