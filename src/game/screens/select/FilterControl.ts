// Ported from osu.Game/Screens/Select/FilterControl.cs
// Collections, the online user and ruleset filter criteria aren't ported (offline, and no ruleset instances): GroupModeDropdown offers the
// osu! ruleset's modes (one gameplay variant: no Variant mode).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { OverlayContainer } from '@fw/graphics/containers/OverlayContainer';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import type { KeyBindingPressEvent } from '@fw/input/bindings/KeyBindings';
import { Key } from '@fw/input/Key';
import { PlatformAction } from '@fw/input/PlatformAction';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { ReverseChildIDFillFlowContainer } from '../../graphics/containers/ReverseChildIDFillFlowContainer';
import { ShearedToggleButton } from '../../graphics/userInterface/ShearedToggleButton';
import { OsuGame } from '../../OsuGame';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { InnerFilterTextBox, ShearedFilterTextBox } from '../../graphics/userInterface/ShearedFilterTextBox';
import type { InnerSearchTextBox } from '../../graphics/userInterface/ShearedSearchTextBox';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { ShearedDropdown } from '../../graphics/userInterfaceV2/ShearedDropdown';
import { CollectionDropdown } from './CollectionDropdown';
import { DifficultyRangeSlider } from './FilterControl.DifficultyRangeSlider';
import { GroupMode, getGroupModeDescription } from './filter/GroupMode';
import { SortMode, getSortModeDescription } from './filter/SortMode';
import { FilterCriteria } from './FilterCriteria';
import { applyQueries } from './FilterQueryParser';
import { ScopedBeatmapSetDisplay } from './FilterControl.ScopedBeatmapSetDisplay';
import { ISongSelect } from './ISongSelect';
import { SongSelect } from './SongSelect';
import { WedgeBackground } from './WedgeBackground';

const corner_radius = 10;

export class FilterControl extends OverlayContainer {
  // taken from draw visualiser. used for carousel alignment purposes.
  static readonly HEIGHT_FROM_SCREEN_TOP = 141 - corner_radius;

  readonly scopedBeatmapSet = new Bindable<BeatmapSetInfo | null>(null);

  private searchTextBox!: SongSelectSearchTextBox;
  private showConvertedBeatmapsButton!: ShearedToggleButton;
  /** (DifficultyRangeSlider.LowerBound / UpperBound) */
  private difficultyRangeSlider!: DifficultyRangeSlider;
  private sortDropdown!: ShearedDropdown<SortMode>;
  private groupDropdown!: GroupModeDropdown;
  private readonly configCollectionFilter = new Bindable<string>('');

  /** An optional method which can force certain criteria adjustments. */
  applyRequiredCriteria: ((criteria: FilterCriteria) => void) | null = null;

  private songSelect: ISongSelect | null = null;

  private ruleset!: Bindable<RulesetInfo>;

  private config!: OsuConfigManager;

  get statusText(): string {
    return this.searchTextBox.statusText;
  }

  set statusText(value: string) {
    this.searchTextBox.statusText = value;
  }

  /** C#'s CriteriaChanged event. */
  criteriaChanged: ((criteria: FilterCriteria) => void) | null = null;

  private currentCriteria!: FilterCriteria;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.songSelect = dependencies.get(ISongSelect);
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo').getBoundCopy();
    this.config = dependencies.resolve(OsuConfigManager);

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    this.shear = OsuGame.SHEAR;
    this.margin = MarginPadding.of({ top: -corner_radius, right: -40 });

    const scopedDisplay = new ScopedBeatmapSetDisplay();
    scopedDisplay.scopedBeatmapSet.bindTarget = this.scopedBeatmapSet;

    this.internalChildren = [
      new Container().with({
        relativeSizeAxes: Axes.Both,
        cornerRadius: corner_radius,
        masking: true,
        child: new WedgeBackground().with({
          anchor: Anchor.TopRight,
          scale: new Vector2(-1, 1),
        }),
      }),
      new ReverseChildIDFillFlowContainer().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        direction: FillDirection.Vertical,
        padding: MarginPadding.of({ top: corner_radius + 5, bottom: 2, right: 40, left: 2 }),
        children: [
          new ReverseChildIDFillFlowContainer().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            direction: FillDirection.Vertical,
            spacing: new Vector2(0, 5),
            children: [
              new Container().with({
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
                shear: OsuGame.SHEAR.neg(),
                child: this.searchTextBox = new SongSelectSearchTextBox().with({
                  relativeSizeAxes: Axes.X,
                  holdFocus: true,
                }),
              }),
              new GridContainer().with({
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
                shear: OsuGame.SHEAR.neg(),
                rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
                columnDimensions: [
                  new Dimension(),
                  new Dimension(GridSizeMode.Absolute), // can probably be removed?
                  new Dimension(GridSizeMode.AutoSize),
                ],
                content: [
                  [
                    this.difficultyRangeSlider = new DifficultyRangeSlider().with({
                      relativeSizeAxes: Axes.X,
                      minRange: 0.1,
                    }),
                    emptyDrawable(),
                    this.showConvertedBeatmapsButton = new ShearedToggleButton().with({
                      anchor: Anchor.Centre,
                      origin: Anchor.Centre,
                      autoSizeAxes: Axes.X,
                      text: 'Show converts',
                      height: 30,
                    }),
                  ],
                ],
              }),
              new GridContainer().with({
                relativeSizeAxes: Axes.X,
                height: 30,
                shear: OsuGame.SHEAR.neg(),
                rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
                columnDimensions: [
                  new Dimension(GridSizeMode.Distributed, 0, 0, 180),
                  new Dimension(GridSizeMode.Absolute, 5),
                  new Dimension(GridSizeMode.Distributed, 0, 0, 180),
                  new Dimension(GridSizeMode.Absolute, 5),
                  new Dimension(),
                  new Dimension(GridSizeMode.AutoSize),
                ],
                content: [
                  [
                    this.sortDropdown = new SortModeDropdown('Sort').with({
                      relativeSizeAxes: Axes.X,
                      items: Object.values(SortMode),
                    }),
                    emptyDrawable(),
                    this.groupDropdown = new GroupModeDropdown('Group').with({
                      relativeSizeAxes: Axes.X,
                    }),
                    emptyDrawable(),
                    new CollectionDropdown().with({
                      relativeSizeAxes: Axes.X,
                    }),
                  ],
                ],
              }),
            ],
          }),
          scopedDisplay,
        ],
      }),
    ];

    this.searchTextBox.scopedBeatmapSet.bindTarget = this.scopedBeatmapSet;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.difficultyRangeSlider.lowerBound = this.config.getBindable<number>(OsuSetting.DisplayStarsMinimum);
    this.difficultyRangeSlider.upperBound = this.config.getBindable<number>(OsuSetting.DisplayStarsMaximum);
    this.config.bindWith(OsuSetting.ShowConvertedBeatmaps, this.showConvertedBeatmapsButton.active);
    this.config.bindWith(OsuSetting.SongSelectSortingMode, this.sortDropdown.current);
    this.config.bindWith(OsuSetting.SongSelectCollectionFilter, this.configCollectionFilter);

    this.ruleset.bindValueChanged(() => this.updateCriteria());

    this.searchTextBox.current.bindValueChanged(() => this.updateCriteria());

    let sliderDebounce: ScheduledDelegate | null = null;

    // For slider dragging (where input events can arrive very often), even creating criteria can have
    // overhead, especially when a collection is selected (see ToImmutableHashSet() call).
    const debouncedUpdateCriteria = () => {
      sliderDebounce?.cancel();
      sliderDebounce = this.scheduler.addDelayed(() => this.updateCriteria(), 50);
    };

    this.difficultyRangeSlider.lowerBound.bindValueChanged(() => debouncedUpdateCriteria());
    this.difficultyRangeSlider.upperBound.bindValueChanged(() => debouncedUpdateCriteria());

    this.showConvertedBeatmapsButton.active.bindValueChanged(() => this.updateCriteria());
    this.sortDropdown.current.bindValueChanged(() => this.updateCriteria());
    this.groupDropdown.current.bindValueChanged(() => this.updateCriteria());
    this.configCollectionFilter.bindValueChanged(() => this.updateCriteria());

    this.scopedBeatmapSet.bindValueChanged(() => this.updateCriteria(false));

    this.updateCriteria();
  }

  /** Creates a FilterCriteria based on the current state of the controls. */
  createCriteria(): FilterCriteria {
    const query = this.searchTextBox.current.value;

    const criteria = Object.assign(new FilterCriteria(), {
      selectedBeatmapSet: this.scopedBeatmapSet.value,
      sort: this.sortDropdown.current.value,
      group: this.groupDropdown.current.value?.value ?? GroupMode.None,
      allowConvertedBeatmaps: this.showConvertedBeatmapsButton.active.value,
      ruleset: this.ruleset.value,
    });

    if (!this.difficultyRangeSlider.lowerBound.isDefault)
      criteria.userStarDifficulty.min = this.difficultyRangeSlider.lowerBound.value;

    if (!this.difficultyRangeSlider.upperBound.isDefault)
      criteria.userStarDifficulty.max = this.difficultyRangeSlider.upperBound.value;

    applyQueries(criteria, query);

    this.applyRequiredCriteria?.(criteria);

    return criteria;
  }

  private updateCriteria(clearScopedSet = true): void {
    if (clearScopedSet && this.scopedBeatmapSet.value !== null) {
      this.songSelect?.unscopeBeatmapSet();
      // because `scopedBeatmapSet` has a value change callback bound to it that calls `updateCriteria()` again,
      // we can just do nothing other than clear it to avoid extra work and duplicated `criteriaChanged` invocations
      return;
    }

    this.currentCriteria = this.createCriteria();
    this.criteriaChanged?.(this.currentCriteria);
  }

  /** Set the query to the search text box. */
  search(query: string): void {
    this.searchTextBox.current.value = query;
  }

  /** Add the query to the search text box. */
  addToSearch(query: string): void {
    const existingQuery = this.searchTextBox.current.value;

    if (existingQuery.includes(query))
      return;

    this.searchTextBox.current.value = existingQuery.trim() === ''
      ? query
      : [existingQuery.trim(), query].join(' ');
  }

  protected override popIn(): void {
    this.moveToX(0, SongSelect.ENTER_DURATION, Easing.OutQuint)
      .fadeIn(SongSelect.ENTER_DURATION / 3, Easing.In);
  }

  protected override popOut(): void {
    this.moveToX(150, SongSelect.ENTER_DURATION, Easing.OutQuint)
      .fadeOut(SongSelect.ENTER_DURATION / 3, Easing.In);
  }
}

/** (FilterControl.SongSelectSearchTextBox) */
export class SongSelectSearchTextBox extends ShearedFilterTextBox {
  // (C# initializes it before the base constructor, which creates the inner text box binding to it; a declared, lazily created field
  // survives the base constructor here.)
  declare private _scopedBeatmapSet: Bindable<BeatmapSetInfo | null> | undefined;

  get scopedBeatmapSet(): Bindable<BeatmapSetInfo | null> {
    return this._scopedBeatmapSet ??= new Bindable<BeatmapSetInfo | null>(null);
  }

  protected override createInnerTextBox(): InnerSearchTextBox {
    const textBox = new SongSelectInnerTextBox();
    textBox.scopedBeatmapSet.bindTarget = this.scopedBeatmapSet;
    return textBox;
  }
}

/** (SongSelectSearchTextBox.InnerTextBox) */
class SongSelectInnerTextBox extends InnerFilterTextBox {
  readonly scopedBeatmapSet = new Bindable<BeatmapSetInfo | null>(null);

  override get handleLeftRightArrows(): boolean {
    return false;
  }

  protected override onGlobalActionPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.action === GlobalAction.Back && this.scopedBeatmapSet.value !== null)
      return false;

    return super.onGlobalActionPressed(e);
  }

  protected override onPlatformActionPressed(e: KeyBindingPressEvent<PlatformAction>): boolean {
    // Conflicts with default group navigation keys (shift-left shift-right).
    if (e.action === PlatformAction.SelectBackwardChar || e.action === PlatformAction.SelectForwardChar)
      return false;

    // the "cut" platform key binding (shift-delete) conflicts with the beatmap deletion action.
    if (e.action === PlatformAction.Cut && e.shiftPressed && e.currentState.keyboard.keys.isPressed(Key.Delete))
      return false;

    return super.onPlatformActionPressed(e);
  }
}

/** (ShearedDropdown<SortMode>: its items' [LocalisableDescription]) */
class SortModeDropdown extends ShearedDropdown<SortMode> {
  protected override generateItemText(item: SortMode): string {
    return getSortModeDescription(item);
  }
}

/** (FilterControl.GroupModeDropdownItem) */
interface GroupModeDropdownItem {
  readonly value: GroupMode;
  readonly text: string;
}

/** (FilterControl.GroupModeDropdown) */
class GroupModeDropdown extends ShearedDropdown<GroupModeDropdownItem> {
  private ruleset!: Bindable<RulesetInfo>;

  private readonly configGroupMode = new Bindable<GroupMode>(GroupMode.None);

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo').getBoundCopy();
    dependencies.resolve(OsuConfigManager).bindWith(OsuSetting.SongSelectGroupMode, this.configGroupMode);

    return r;
  }

  protected override loadAsyncComplete(): void {
    // Bindings set up intentionally in `loadAsyncComplete()` rather than `loadComplete()` as normal
    // to avoid double-filter on entering song select with the "variant" group mode engaged.
    this.ruleset.bindValueChanged(() => {
      this.updateAvailableItems();
      this.updateCurrentFromConfig();
    }, true);
    this.configGroupMode.bindValueChanged(() => this.updateCurrentFromConfig());
    this.current.bindValueChanged(this.currentChanged);

    // Ordering important - base call must run *after* the above bindings
    // because the bindings set up `items`, and the base call is responsible for calling `generateItemText()`.
    super.loadAsyncComplete();
  }

  private updateAvailableItems(): void {
    const items: GroupModeDropdownItem[] = [];

    for (const item of Object.values(GroupMode)) {
      switch (item) {
        default:
          items.push({ value: item, text: getGroupModeDescription(item) });
          break;

        case GroupMode.Variant:
          // (the osu! ruleset has a single gameplay variant)
          break;
      }
    }

    this.items = items;
  }

  private synchronisingBindables = false;

  private updateCurrentFromConfig(): void {
    if (this.synchronisingBindables)
      return;

    this.synchronisingBindables = true;
    // Only rulesets that actually have variants expose and support the "variant" grouping mode.
    // If it's missing, default to no grouping.
    this.current.value = this.items.find(i => i.value === this.configGroupMode.value) ?? this.items.find(i => i.value === GroupMode.None)!;
    this.synchronisingBindables = false;
  }

  private readonly currentChanged = (current: ValueChangedEvent<GroupModeDropdownItem>): void => {
    if (this.synchronisingBindables)
      return;

    // Only rulesets that actually have variants expose and support the "variant" grouping mode.
    // If it's missing, code above will revert to no grouping, which also incurs a `current` change.
    // However, for better user experience, don't write the new value out to config in this scenario
    // so that the variant grouping is re-engaged on switching to a ruleset that has variant support
    // (this also persists across game restarts).
    if (current.oldValue?.value === GroupMode.Variant && this.items.every(i => i.value !== GroupMode.Variant))
      return;

    this.synchronisingBindables = true;
    this.configGroupMode.value = current.newValue.value;
    this.synchronisingBindables = false;
  };

  protected override generateItemText(item: GroupModeDropdownItem): string {
    return item.text;
  }
}
