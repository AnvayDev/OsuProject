// Ported from osu.Game/Overlays/BeatmapListing/BeatmapListingSortTabControl.cs
// SortDirection bindables are created on first use: C# field initializers run before the base constructor, which calls CreateControl and
// CreateTabButton.

import { Bindable } from '@fw/bindables/Bindable';
import type { Colour4 } from '@fw/graphics/Colour4';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { TabItem } from '@fw/graphics/userInterface/TabItem';
import type { ClickEvent } from '@fw/input/events/UIEvents';
import { Anchor } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OverlaySortTabControl, SortTabControl, SortTabItem, TabButton } from '../OverlaySortTabControl';
import { SortDirection } from '../SortDirection';
import { SearchCategory } from './SearchCategory';
import { getSortCriteriaDescription, SortCriteria } from './SortCriteria';

const lazyDirection = (owner: { _sortDirection?: Bindable<SortDirection> }, initial: SortDirection): Bindable<SortDirection> =>
  owner._sortDirection ??= new Bindable<SortDirection>(initial);

export class BeatmapListingSortTabControl extends OverlaySortTabControl<SortCriteria> {
  declare _sortDirection?: Bindable<SortDirection>;

  get sortDirection(): Bindable<SortDirection> {
    return lazyDirection(this, SortDirection.Descending);
  }

  private currentParameters: { category: SearchCategory; hasQuery: boolean } | null = null;

  constructor() {
    super(getSortCriteriaDescription);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    if (this.currentParameters === null)
      this.reset(SearchCategory.Leaderboard, false);

    this.current.bindValueChanged(() => this.sortDirection.value = SortDirection.Descending);
  }

  reset(category: SearchCategory, hasQuery: boolean): void {
    if (this.currentParameters?.category !== category || this.currentParameters.hasQuery !== hasQuery) {
      this.tabControl.clear();

      this.tabControl.addItem(SortCriteria.Title);
      this.tabControl.addItem(SortCriteria.Artist);
      this.tabControl.addItem(SortCriteria.Difficulty);

      if (category === SearchCategory.Any || category > SearchCategory.Loved)
        this.tabControl.addItem(SortCriteria.Updated);

      if (category < SearchCategory.Pending || category === SearchCategory.Mine)
        this.tabControl.addItem(SortCriteria.Ranked);

      this.tabControl.addItem(SortCriteria.Rating);
      this.tabControl.addItem(SortCriteria.Plays);
      this.tabControl.addItem(SortCriteria.Favourites);

      if (hasQuery)
        this.tabControl.addItem(SortCriteria.Relevance);

      if (category === SearchCategory.Pending)
        this.tabControl.addItem(SortCriteria.Nominations);
    }

    const nonQueryCriteria = category >= SearchCategory.Pending ? SortCriteria.Updated : SortCriteria.Ranked;

    this.current.value = hasQuery ? SortCriteria.Relevance : nonQueryCriteria;
    this.sortDirection.value = SortDirection.Descending;

    // if the new criteria isn't different from the previous one,
    // then re-adding tab items will not mark the current tab as selected.
    // see: https://github.com/ppy/osu-framework/issues/5412
    this.tabControl.current.triggerChange();

    this.currentParameters = { category, hasQuery };
  }

  protected override createControl(describe: (value: SortCriteria) => string): SortTabControl<SortCriteria> {
    const control = new BeatmapSortTabControl(describe);
    control.sortDirection.bindTarget = this.sortDirection;
    return control;
  }
}

/** (BeatmapListingSortTabControl.BeatmapSortTabControl) */
class BeatmapSortTabControl extends SortTabControl<SortCriteria> {
  declare _sortDirection?: Bindable<SortDirection>;

  get sortDirection(): Bindable<SortDirection> {
    return lazyDirection(this, SortDirection.Ascending);
  }

  protected override createTabItem(value: SortCriteria): TabItem<SortCriteria> {
    const item = new BeatmapSortTabItem(value, this.describe);
    item.sortDirection.bindTarget = this.sortDirection;
    return item;
  }
}

/** (BeatmapListingSortTabControl.BeatmapSortTabItem) */
class BeatmapSortTabItem extends SortTabItem<SortCriteria> {
  declare _sortDirection?: Bindable<SortDirection>;

  get sortDirection(): Bindable<SortDirection> {
    return lazyDirection(this, SortDirection.Ascending);
  }

  protected override createTabButton(value: SortCriteria, describe: (value: SortCriteria) => string): TabButton<SortCriteria> {
    const button = new BeatmapTabButton(value, describe);
    button.active.bindTarget = this.active;
    button.sortDirection.bindTarget = this.sortDirection;
    return button;
  }
}

/** (BeatmapListingSortTabControl.BeatmapTabButton) */
export class BeatmapTabButton extends TabButton<SortCriteria> {
  readonly sortDirection = new Bindable<SortDirection>(SortDirection.Ascending);

  protected override set contentColour(value: Colour4) {
    super.contentColour = value;
    this.icon.colour = value;
  }

  private readonly icon: SpriteIcon;

  constructor(value: SortCriteria, describe: (value: SortCriteria) => string) {
    super(value, describe);

    this.add(this.icon = new SpriteIcon().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      alwaysPresent: true,
      alpha: 0,
      size: new Vector2(6),
      icon: FontAwesome.Solid.CaretDown,
    }));
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.sortDirection.bindValueChanged(direction => {
      this.icon.scaleTo(direction.newValue === SortDirection.Ascending && this.active.value ? new Vector2(1, -1) : Vector2.One, 300, Easing.OutQuint);
    }, true);
  }

  protected override updateState(): void {
    super.updateState();

    this.icon.fadeTo(this.active.value || this.isHovered ? 1 : 0, 200, Easing.OutQuint);
  }

  protected override onClick(e: ClickEvent): boolean {
    if (this.active.value)
      this.sortDirection.value = this.sortDirection.value === SortDirection.Ascending ? SortDirection.Descending : SortDirection.Ascending;

    return super.onClick(e);
  }
}
