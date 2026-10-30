// Ported from osu.Game/Overlays/BeatmapListing/BeatmapListingFilterControl.cs
// Web: searches go to the mirror (SearchBeatmapSetsRequest) and there is no login, so searching is always possible (C#'s api.IsLoggedIn) and
// the user is never a supporter (the supporter-only filters give the SupporterOnlyFilters result).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Game } from '@fw/Game';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { BeatmapCardSize } from '../../beatmaps/drawables/cards/BeatmapCardSize';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { SearchBeatmapSetsRequest, type SearchBeatmapSetsResponse } from '../../online/api/requests/SearchBeatmapSetsRequest';
import type { APIBeatmapSet } from '../../online/api/requests/responses/APIBeatmapSet';
import { OverlayColourProvider } from '../OverlayColourProvider';
import { BeatmapListingCardSizeTabControl } from './BeatmapListingCardSizeTabControl';
import { BeatmapListingSearchControl } from './BeatmapListingSearchControl';
import { BeatmapListingSortTabControl } from './BeatmapListingSortTabControl';
import type { SearchGenre } from './SearchGenre';
import type { SearchLanguage } from './SearchLanguage';
import { SearchPlayed } from './SearchPlayed';

export enum SearchResultType {
  ResultsReturned,
  SupporterOnlyFilters,
}

/** (BeatmapListingFilterControl.SearchResult) */
export type SearchResult =
  | { readonly type: SearchResultType.ResultsReturned; readonly results: APIBeatmapSet[] }
  | { readonly type: SearchResultType.SupporterOnlyFilters; readonly supporterOnlyFiltersUsed: string[] };

export class BeatmapListingFilterControl extends CompositeDrawable {
  /** Fired when a search finishes. */
  searchFinished: ((result: SearchResult) => void) | null = null;

  /** Fired when search criteria change. */
  searchStarted: (() => void) | null = null;

  searchFailed: (() => void) | null = null;

  /** Any time the search text box receives key events (even while masked). */
  typingStarted: (() => void) | null = null;

  /** True when pagination has reached the end of available results. */
  private noMoreResults = false;

  /** The current page fetched of results (zero index). */
  private _currentPage = 0;

  get currentPage(): number {
    return this._currentPage;
  }

  get cardSize(): Bindable<BeatmapCardSize> {
    return this._cardSize;
  }

  private readonly _cardSize = new Bindable<BeatmapCardSize>(BeatmapCardSize.Normal);

  private readonly searchControl: BeatmapListingSearchControl;
  private readonly sortControl: BeatmapListingSortTabControl;
  private readonly sortControlBackground: Box;

  private queryChangedDebounce: ScheduledDelegate | null = null;

  private getSetsRequest: SearchBeatmapSetsRequest | null = null;
  private lastResponse: SearchBeatmapSetsResponse | null = null;

  private config!: OsuConfigManager;
  private game!: Game;
  private nextRequestTime = 0;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    const cardSizeControl = new BeatmapListingCardSizeTabControl().with({
      anchor: Anchor.CentreRight,
      origin: Anchor.CentreRight,
      margin: MarginPadding.of({ right: 20 }),
    });
    cardSizeControl.current.bindTarget = this._cardSize;

    this.internalChild = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
      spacing: new Vector2(0, 10),
      children: [
        new Container().with({
          relativeSizeAxes: Axes.X,
          autoSizeAxes: Axes.Y,
          masking: true,
          edgeEffect: new EdgeEffectParameters({
            colour: Colour4.Black.opacity(0.25),
            type: EdgeEffectType.Shadow,
            radius: 3,
            offset: new Vector2(0, 1),
          }),
          child: this.searchControl = new BeatmapListingSearchControl().with({
            typingStarted: () => this.typingStarted?.(),
          }),
        }),
        new Container().with({
          relativeSizeAxes: Axes.X,
          height: 40,
          children: [
            this.sortControlBackground = new Box().with({
              relativeSizeAxes: Axes.Both,
            }),
            this.sortControl = new BeatmapListingSortTabControl().with({
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
              margin: MarginPadding.of({ left: 20 }),
            }),
            cardSizeControl,
          ],
        }),
      ],
    });
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.config = dependencies.resolve(OsuConfigManager);
    this.game = dependencies.resolve(Game);
    this.sortControlBackground.colour = dependencies.resolve(OverlayColourProvider).background4;

    return r;
  }

  search(query: string): void {
    this.schedule(() => this.searchControl.query.value = query);
  }

  filterGenre(genre: SearchGenre): void {
    this.schedule(() => this.searchControl.genre.value = genre);
  }

  filterLanguage(language: SearchLanguage): void {
    this.schedule(() => this.searchControl.language.value = language);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.config.bindWith(OsuSetting.BeatmapListingCardSize, this._cardSize);

    this.searchControl.query.bindValueChanged(() => {
      this.resetSortControl();
      this.queueUpdateSearch(true);
    });

    this.searchControl.category.bindValueChanged(() => {
      this.resetSortControl();
      this.queueUpdateSearch();
    });

    this.searchControl.general.collectionChanged.add(() => this.queueUpdateSearch());
    this.searchControl.ruleset.bindValueChanged(() => this.queueUpdateSearch());
    this.searchControl.genre.bindValueChanged(() => this.queueUpdateSearch());
    this.searchControl.language.bindValueChanged(() => this.queueUpdateSearch());
    this.searchControl.extra.collectionChanged.add(() => this.queueUpdateSearch());
    this.searchControl.ranks.collectionChanged.add(() => this.queueUpdateSearch());
    this.searchControl.played.bindValueChanged(() => this.queueUpdateSearch());
    this.searchControl.explicitContent.bindValueChanged(() => this.queueUpdateSearch());

    this.sortControl.current.bindValueChanged(() => this.queueUpdateSearch());
    this.sortControl.sortDirection.bindValueChanged(() => this.queueUpdateSearch());

    // (apiUser.BindValueChanged: the local user never changes)
  }

  takeFocus(): void {
    this.searchControl.takeFocus();
  }

  /** Fetch the next page of results. May result in a no-op if a fetch is already in progress, or if there are no results left. */
  fetchNextPage(): void {
    // there may be no results left.
    if (this.noMoreResults)
      return;

    // there may already be an active request.
    if (this.getSetsRequest !== null || this.time.current < this.nextRequestTime)
      return;

    this.performRequest();
  }

  private resetSortControl(): void {
    this.sortControl.reset(this.searchControl.category.value, !!this.searchControl.query.value);
  }

  private queueUpdateSearch(queryTextChanged = false): void {
    this.searchStarted?.();

    this.resetSearch();

    this.queryChangedDebounce = this.scheduler.addDelayed(() => {
      this.resetSearch();
      this.fetchNextPage();
    }, queryTextChanged ? 500 : 100);
  }

  private performRequest(): void {
    const request = this.getSetsRequest = new SearchBeatmapSetsRequest(
      this.searchControl.query.value,
      this.searchControl.ruleset.value,
      this.lastResponse?.cursor ?? null,
      [...this.searchControl.general],
      this.searchControl.category.value,
      this.sortControl.current.value,
      this.sortControl.sortDirection.value,
      this.searchControl.genre.value,
      this.searchControl.language.value,
      [...this.searchControl.extra],
      [...this.searchControl.ranks],
      this.searchControl.played.value,
      this.searchControl.explicitContent.value);

    // APIAccess dispatches on the game's update thread. The filter's own scheduler stops
    // when the header scrolls offscreen, exactly when pagination needs to complete.
    request.success.add(response => this.game.schedule(() => {
      if (this.isDisposed || this.getSetsRequest !== request)
        return;

      const sets = [...response.beatmapSets];

      // If the previous request returned a null cursor, the API is indicating we can't paginate further (maybe there are no more beatmaps left).
      if (sets.length === 0 || response.cursor === null)
        this.noMoreResults = true;

      if (this.lastResponse !== null)
        this._currentPage++;

      if (this._currentPage === 0)
        this.searchControl.beatmapSet = sets[0] ?? null;

      this.lastResponse = response;
      this.getSetsRequest = null;

      // check if a non-supporter used supporter-only filters
      const filters: string[] = [];

      if (this.searchControl.played.value !== SearchPlayed.Any)
        filters.push('Played');

      if (this.searchControl.ranks.count > 0)
        filters.push('Rank Achieved');

      if (filters.length > 0) {
        this.searchFinished?.({ type: SearchResultType.SupporterOnlyFilters, supporterOnlyFiltersUsed: filters });
        return;
      }

      this.searchFinished?.({ type: SearchResultType.ResultsReturned, results: sets });
    }));

    request.failure.add(() => this.game.schedule(() => {
      if (this.isDisposed || this.getSetsRequest !== request)
        return;

      this.getSetsRequest = null;
      // Keep the previous cursor so pagination retries the failed page, with backoff rather
      // than issuing a request every frame while the user remains at the bottom.
      this.nextRequestTime = this.time.current + 2000;
      this.searchFailed?.();
    }));

    void request.perform();
  }

  private resetSearch(): void {
    this.noMoreResults = false;
    this._currentPage = 0;
    this.nextRequestTime = 0;

    this.lastResponse = null;

    this.getSetsRequest?.cancel();
    this.getSetsRequest = null;

    this.queryChangedDebounce?.cancel();
  }

  protected override disposeInternal(isDisposing: boolean): void {
    this.resetSearch();

    super.disposeInternal(isDisposing);
  }
}
