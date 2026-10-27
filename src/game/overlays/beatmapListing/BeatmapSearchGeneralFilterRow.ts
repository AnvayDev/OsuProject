// Ported from osu.Game/Overlays/BeatmapListing/BeatmapSearchGeneralFilterRow.cs
// Not ported: DifficultyRecommender (it needs the user's statistics; with no recommender the Recommended label is the plain description, as
// in C#), the featured artist disclaimer dialog (no dialog overlay: the click goes straight through, as with a null IDialogOverlay) and
// tooltips. HideUnlicensedContent is false.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import type { Colour4 } from '@fw/graphics/Colour4';
import type { ClickEvent } from '@fw/input/events/UIEvents';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { SessionStatics, Static } from '../../configuration/SessionStatics';
import { OsuColour } from '../../graphics/OsuColour';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { BeatmapSearchMultipleSelectionFilterRow, MultipleSelectionFilter, MultipleSelectionFilterTabItem } from './BeatmapSearchMultipleSelectionFilterRow';
import type { FilterValues } from './BeatmapSearchFilterRow';
import { getSearchGeneralDescription, SearchGeneral } from './SearchGeneral';

const values: FilterValues<SearchGeneral> = {
  values: [SearchGeneral.Recommended, SearchGeneral.Converts, SearchGeneral.Follows, SearchGeneral.Spotlights, SearchGeneral.FeaturedArtists],
  describe: getSearchGeneralDescription,
};

export class BeatmapSearchGeneralFilterRow extends BeatmapSearchMultipleSelectionFilterRow<SearchGeneral> {
  readonly ruleset = new Bindable<RulesetInfo>(null!);

  constructor() {
    super('General', values);
  }

  protected override createMultipleSelectionFilter(filterValues: FilterValues<SearchGeneral>): MultipleSelectionFilter<SearchGeneral> {
    return new GeneralFilter(filterValues);
  }
}

/** (BeatmapSearchGeneralFilterRow.GeneralFilter) */
class GeneralFilter extends MultipleSelectionFilter<SearchGeneral> {
  protected override createTabItem(value: SearchGeneral): MultipleSelectionFilterTabItem<SearchGeneral> {
    switch (value) {
      case SearchGeneral.FeaturedArtists:
        return new FeaturedArtistsTabItem(this.filterValues.describe);

      default:
        // (SearchGeneral.Recommended's RecommendedDifficultyTabItem shows the plain description without a DifficultyRecommender)
        return new MultipleSelectionFilterTabItem<SearchGeneral>(value, this.filterValues.describe);
    }
  }
}

/** (BeatmapSearchGeneralFilterRow.FeaturedArtistsTabItem) */
class FeaturedArtistsTabItem extends MultipleSelectionFilterTabItem<SearchGeneral> {
  private disclaimerShown!: Bindable<boolean>;

  private colours!: OsuColour;
  private config!: OsuConfigManager;
  private sessionStatics!: SessionStatics;

  constructor(describe: (value: SearchGeneral) => string) {
    super(SearchGeneral.FeaturedArtists, describe);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    this.colours = dependencies.resolve(OsuColour);
    this.config = dependencies.resolve(OsuConfigManager);
    this.sessionStatics = dependencies.resolve(SessionStatics);

    await super.load(dependencies);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.config.bindWith(OsuSetting.BeatmapListingFeaturedArtistFilter, this.active);
    this.disclaimerShown = this.sessionStatics.getBindable<boolean>(Static.FeaturedArtistDisclaimerShownOnce);

    // no need to show the disclaimer if the user already had it toggled off in config.
    if (!this.active.value)
      this.disclaimerShown.value = true;
  }

  protected override get colourNormal(): Colour4 {
    return this.colours.orange1;
  }

  protected override get colourActive(): Colour4 {
    return this.colours.orange2;
  }

  protected override onClick(e: ClickEvent): boolean {
    if (!this.enabled.value)
      return true;

    return super.onClick(e);
  }
}
