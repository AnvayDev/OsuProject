// Ported from osu.Game/Screens/Select/FilterControl.cs
// Not ported yet: the search text box (with FilterQueryParser), the difficulty range slider and the sort / group / collection dropdowns, whose
// framework controls (TextBox, SliderBar, Dropdown) are still to come. Until then their Current bindables exist without a drawable and the
// criteria read them as C# does (the slider's bounds and the sort / group modes are bound to their settings). Collections, the online user
// and ruleset filter criteria aren't ported (offline, and no ruleset instances).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import type { BindableNumber } from '@fw/bindables/BindableNumber';
import { Container } from '@fw/graphics/containers/Container';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { OverlayContainer } from '@fw/graphics/containers/OverlayContainer';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
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
import { GroupMode } from './filter/GroupMode';
import { SortMode } from './filter/SortMode';
import { FilterCriteria } from './FilterCriteria';
import { ScopedBeatmapSetDisplay } from './FilterControl.ScopedBeatmapSetDisplay';
import { ISongSelect } from './ISongSelect';
import { SongSelect } from './SongSelect';
import { WedgeBackground } from './WedgeBackground';

const corner_radius = 10;

export class FilterControl extends OverlayContainer {
  // taken from draw visualiser. used for carousel alignment purposes.
  static readonly HEIGHT_FROM_SCREEN_TOP = 141 - corner_radius;

  readonly scopedBeatmapSet = new Bindable<BeatmapSetInfo | null>(null);

  /** (SongSelectSearchTextBox.Current) */
  private readonly searchText = new Bindable<string>('');
  private showConvertedBeatmapsButton!: ShearedToggleButton;
  /** (DifficultyRangeSlider.LowerBound / UpperBound) */
  private lowerBound!: BindableNumber;
  private upperBound!: BindableNumber;
  /** (sortDropdown.Current / groupDropdown.Current) */
  private readonly sortMode = new Bindable<SortMode>(SortMode.Title);
  private readonly groupMode = new Bindable<GroupMode>(GroupMode.None);
  private readonly configCollectionFilter = new Bindable<string>('');

  /** An optional method which can force certain criteria adjustments. */
  applyRequiredCriteria: ((criteria: FilterCriteria) => void) | null = null;

  private songSelect: ISongSelect | null = null;

  private ruleset!: Bindable<RulesetInfo>;

  private config!: OsuConfigManager;

  private _statusText = '';

  /** (SongSelectSearchTextBox.StatusText) */
  get statusText(): string {
    return this._statusText;
  }

  set statusText(value: string) {
    this._statusText = value;
  }

  /** C#'s CriteriaChanged event. */
  criteriaChanged: ((criteria: FilterCriteria) => void) | null = null;

  private currentCriteria!: FilterCriteria;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.songSelect = dependencies.get(ISongSelect);
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo');
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
                    emptyDrawable(),
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
            ],
          }),
          scopedDisplay,
        ],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.lowerBound = this.config.getBindable<number>(OsuSetting.DisplayStarsMinimum) as BindableNumber;
    this.upperBound = this.config.getBindable<number>(OsuSetting.DisplayStarsMaximum) as BindableNumber;
    this.config.bindWith(OsuSetting.ShowConvertedBeatmaps, this.showConvertedBeatmapsButton.active);
    this.config.bindWith(OsuSetting.SongSelectSortingMode, this.sortMode);
    this.config.bindWith(OsuSetting.SongSelectCollectionFilter, this.configCollectionFilter);
    this.config.bindWith(OsuSetting.SongSelectGroupMode, this.groupMode);

    this.ruleset.bindValueChanged(() => this.updateCriteria());

    this.searchText.bindValueChanged(() => this.updateCriteria());

    let sliderDebounce: ScheduledDelegate | null = null;

    // For slider dragging (where input events can arrive very often), even creating criteria can have
    // overhead, especially when a collection is selected (see ToImmutableHashSet() call).
    const debouncedUpdateCriteria = () => {
      sliderDebounce?.cancel();
      sliderDebounce = this.scheduler.addDelayed(() => this.updateCriteria(), 50);
    };

    this.lowerBound.bindValueChanged(() => debouncedUpdateCriteria());
    this.upperBound.bindValueChanged(() => debouncedUpdateCriteria());

    this.showConvertedBeatmapsButton.active.bindValueChanged(() => this.updateCriteria());
    this.sortMode.bindValueChanged(() => this.updateCriteria());
    this.groupMode.bindValueChanged(() => this.updateCriteria());
    this.configCollectionFilter.bindValueChanged(() => this.updateCriteria());

    this.scopedBeatmapSet.bindValueChanged(() => this.updateCriteria(false));

    this.updateCriteria();
  }

  /** Creates a FilterCriteria based on the current state of the controls. */
  createCriteria(): FilterCriteria {
    const criteria = Object.assign(new FilterCriteria(), {
      selectedBeatmapSet: this.scopedBeatmapSet.value,
      sort: this.sortMode.value,
      group: this.groupMode.value ?? GroupMode.None,
      allowConvertedBeatmaps: this.showConvertedBeatmapsButton.active.value,
      ruleset: this.ruleset.value,
    });

    if (!this.lowerBound.isDefault)
      criteria.userStarDifficulty.min = this.lowerBound.value;

    if (!this.upperBound.isDefault)
      criteria.userStarDifficulty.max = this.upperBound.value;

    // (FilterQueryParser.ApplyQueries arrives with the search text box; until then the text is the plain search text.)
    criteria.searchText = this.searchText.value;

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
    this.searchText.value = query;
  }

  /** Add the query to the search text box. */
  addToSearch(query: string): void {
    const existingQuery = this.searchText.value;

    if (existingQuery.includes(query))
      return;

    this.searchText.value = existingQuery.trim() === ''
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
