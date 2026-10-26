// Ported from osu.Game/Overlays/BeatmapListing/BeatmapSearchRulesetFilterRow.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { RulesetInfo, RulesetStore } from '../../rulesets/RulesetInfo';
import { BeatmapSearchFilter, BeatmapSearchFilterRow } from './BeatmapSearchFilterRow';
import { FilterTabItem } from './FilterTabItem';

export class BeatmapSearchRulesetFilterRow extends BeatmapSearchFilterRow<RulesetInfo> {
  constructor() {
    super('Mode');
  }

  protected override createFilter(): Drawable {
    return new RulesetFilter();
  }
}

/** (BeatmapSearchRulesetFilterRow.RulesetFilter) */
class RulesetFilter extends BeatmapSearchFilter<RulesetInfo> {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.addTabItem(new RulesetFilterTabItemAny());

    for (const ruleset of RulesetStore.availableRulesets) {
      // Don't display non-legacy rulesets (all four built-in rulesets are legacy rulesets)
      this.addItem(ruleset);
    }

    return r;
  }
}

/** (BeatmapSearchRulesetFilterRow.RulesetFilterTabItemAny) */
class RulesetFilterTabItemAny extends FilterTabItem<RulesetInfo> {
  protected override labelFor(_info: RulesetInfo): string {
    return 'Any';
  }

  constructor() {
    super(new RulesetInfo());
  }
}
