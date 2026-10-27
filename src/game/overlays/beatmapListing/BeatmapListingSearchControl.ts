// Ported from osu.Game/Overlays/BeatmapListing/BeatmapListingSearchControl.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import type { BindableList } from '@fw/bindables/BindableList';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Box } from '@fw/graphics/shapes/Box';
import type { KeyBindingPressEvent } from '@fw/input/bindings/KeyBindings';
import type { KeyDownEvent } from '@fw/input/events/UIEvents';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { UpdateableOnlineBeatmapSetCover } from '../../beatmaps/drawables/UpdateableOnlineBeatmapSetCover';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { ReverseChildIDFillFlowContainer } from '../../graphics/containers/ReverseChildIDFillFlowContainer';
import { BasicSearchTextBox } from '../../graphics/userInterface/BasicSearchTextBox';
import type { GlobalAction } from '../../input/bindings/GlobalAction';
import type { APIBeatmapSet } from '../../online/api/requests/responses/APIBeatmapSet';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import type { ScoreRank } from '../../scoring/ScoreRank';
import { OverlayColourProvider } from '../OverlayColourProvider';
import { WaveOverlayContainer } from '../WaveOverlayContainer';
import { BeatmapSearchFilterRow } from './BeatmapSearchFilterRow';
import { BeatmapSearchGeneralFilterRow } from './BeatmapSearchGeneralFilterRow';
import { BeatmapSearchMultipleSelectionFilterRow } from './BeatmapSearchMultipleSelectionFilterRow';
import { BeatmapSearchRulesetFilterRow } from './BeatmapSearchRulesetFilterRow';
import { BeatmapSearchScoreFilterRow } from './BeatmapSearchScoreFilterRow';
import { getSearchCategoryDescription, SearchCategory } from './SearchCategory';
import { getSearchExplicitDescription, SearchExplicit } from './SearchExplicit';
import { getSearchExtraDescription, SearchExtra } from './SearchExtra';
import { SearchGeneral } from './SearchGeneral';
import { getSearchGenreDescription, type SearchGenre, searchGenreValues } from './SearchGenre';
import { getSearchLanguageDescription, type SearchLanguage, searchLanguageValues } from './SearchLanguage';
import { getSearchPlayedDescription, SearchPlayed } from './SearchPlayed';

export class BeatmapListingSearchControl extends CompositeDrawable {
  typingStarted: (() => void) | null = null;

  get query(): Bindable<string> {
    return this.textBox.current;
  }

  get general(): BindableList<SearchGeneral> {
    return this.generalFilter.currentList;
  }

  get ruleset(): Bindable<RulesetInfo> {
    return this.modeFilter.current;
  }

  get category(): Bindable<SearchCategory> {
    return this.categoryFilter.current;
  }

  get genre(): Bindable<SearchGenre> {
    return this.genreFilter.current;
  }

  get language(): Bindable<SearchLanguage> {
    return this.languageFilter.current;
  }

  get extra(): BindableList<SearchExtra> {
    return this.extraFilter.currentList;
  }

  get ranks(): BindableList<ScoreRank> {
    return this.ranksFilter.currentList;
  }

  get played(): Bindable<SearchPlayed> {
    return this.playedFilter.current;
  }

  get explicitContent(): Bindable<SearchExplicit> {
    return this.explicitContentFilter.current;
  }

  set beatmapSet(value: APIBeatmapSet | null) {
    if (value === null || !value.covers.cover) {
      this.beatmapCover.fadeOut(600, Easing.OutQuint);
      return;
    }

    this.beatmapCover.onlineInfo = value;
    this.beatmapCover.fadeTo(0.1, 200, Easing.OutQuint);
  }

  private readonly textBox: BeatmapSearchTextBox;
  private readonly generalFilter: BeatmapSearchGeneralFilterRow;
  private readonly modeFilter: BeatmapSearchRulesetFilterRow;
  private readonly categoryFilter: BeatmapSearchFilterRow<SearchCategory>;
  private readonly genreFilter: BeatmapSearchFilterRow<SearchGenre>;
  private readonly languageFilter: BeatmapSearchFilterRow<SearchLanguage>;
  private readonly extraFilter: BeatmapSearchMultipleSelectionFilterRow<SearchExtra>;
  private readonly ranksFilter: BeatmapSearchScoreFilterRow;
  private readonly playedFilter: BeatmapSearchFilterRow<SearchPlayed>;
  private readonly explicitContentFilter: BeatmapSearchFilterRow<SearchExplicit>;

  private readonly background: Box;
  private readonly beatmapCover: UpdateableOnlineBeatmapSetCover;

  constructor() {
    super();

    this.autoSizeAxes = Axes.Y;
    this.relativeSizeAxes = Axes.X;

    this.addRangeInternal([
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      new Container().with({
        relativeSizeAxes: Axes.Both,
        masking: true,
        child: this.beatmapCover = new TopSearchBeatmapSetCover().with({
          relativeSizeAxes: Axes.Both,
          alpha: 0,
        }),
      }),
      new Container().with({
        autoSizeAxes: Axes.Y,
        relativeSizeAxes: Axes.X,
        padding: MarginPadding.of({
          vertical: 20,
          horizontal: WaveOverlayContainer.HORIZONTAL_PADDING,
        }),
        child: new FillFlowContainer().with({
          autoSizeAxes: Axes.Y,
          relativeSizeAxes: Axes.X,
          direction: FillDirection.Vertical,
          spacing: new Vector2(0, 20),
          children: [
            this.textBox = new BeatmapSearchTextBox().with({
              relativeSizeAxes: Axes.X,
              textChanged: () => this.typingStarted?.(),
            }),
            new ReverseChildIDFillFlowContainer().with({
              autoSizeAxes: Axes.Y,
              relativeSizeAxes: Axes.X,
              direction: FillDirection.Vertical,
              padding: MarginPadding.of({ horizontal: 10 }),
              spacing: new Vector2(5),
              children: [
                this.generalFilter = new BeatmapSearchGeneralFilterRow(),
                this.modeFilter = new BeatmapSearchRulesetFilterRow(),
                this.categoryFilter = new BeatmapSearchFilterRow<SearchCategory>('Categories', {
                  values: [SearchCategory.Any, SearchCategory.Leaderboard, SearchCategory.Ranked, SearchCategory.Qualified, SearchCategory.Loved,
                    SearchCategory.Favourites, SearchCategory.Pending, SearchCategory.Wip, SearchCategory.Graveyard, SearchCategory.Mine],
                  describe: getSearchCategoryDescription,
                }),
                this.genreFilter = new BeatmapSearchFilterRow<SearchGenre>('Genre', { values: searchGenreValues, describe: getSearchGenreDescription }),
                this.languageFilter = new BeatmapSearchFilterRow<SearchLanguage>('Language', { values: searchLanguageValues, describe: getSearchLanguageDescription }),
                this.extraFilter = new BeatmapSearchMultipleSelectionFilterRow<SearchExtra>('Extra', {
                  values: [SearchExtra.Video, SearchExtra.Storyboard],
                  describe: getSearchExtraDescription,
                }),
                this.ranksFilter = new BeatmapSearchScoreFilterRow(),
                this.playedFilter = new BeatmapSearchFilterRow<SearchPlayed>('Played', {
                  values: [SearchPlayed.Any, SearchPlayed.Played, SearchPlayed.Unplayed],
                  describe: getSearchPlayedDescription,
                }),
                this.explicitContentFilter = new BeatmapSearchFilterRow<SearchExplicit>('Explicit Content', {
                  values: [SearchExplicit.Hide, SearchExplicit.Show],
                  describe: getSearchExplicitDescription,
                }),
              ],
            }),
          ],
        }),
      }),
    ]);

    this.generalFilter.currentList.add(SearchGeneral.FeaturedArtists);
    this.categoryFilter.current.value = SearchCategory.Leaderboard;
  }

  private allowExplicitContent!: Bindable<boolean>;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);
    const config = dependencies.resolve(OsuConfigManager);

    this.background.colour = colourProvider.dark6;

    this.allowExplicitContent = config.getBindable<boolean>(OsuSetting.ShowOnlineExplicitContent);
    this.allowExplicitContent.bindValueChanged(allow => {
      this.explicitContent.value = allow.newValue ? SearchExplicit.Show : SearchExplicit.Hide;
    }, true);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.generalFilter.ruleset.bindTo(this.ruleset);
  }

  takeFocus(): void {
    this.textBox.takeFocus();
  }
}

/** (BeatmapListingSearchControl.BeatmapSearchTextBox) */
class BeatmapSearchTextBox extends BasicSearchTextBox {
  textChanged: (() => void) | null = null;

  protected override get selectionColour(): Colour4 {
    return Colour4.Gray;
  }

  constructor() {
    super();

    this.placeholderText = 'type in keywords...';
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (!super.onKeyDown(e))
      return false;

    this.textChanged?.();
    return true;
  }

  protected override onGlobalActionPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (!super.onGlobalActionPressed(e))
      return false;

    this.textChanged?.();
    return true;
  }
}

/** (BeatmapListingSearchControl.TopSearchBeatmapSetCover) */
class TopSearchBeatmapSetCover extends UpdateableOnlineBeatmapSetCover {
  protected override get transformImmediately(): boolean {
    return true;
  }
}
