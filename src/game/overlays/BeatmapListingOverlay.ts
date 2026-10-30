// Ported from osu.Game/Overlays/BeatmapListingOverlay.cs
// Web: there is no login (the overlay's api.LocalUser handling never changes the results area). Component loads can't be cancelled mid-way
// (CompositeDrawable.loadComponentsAsync has no cancellation token): a cancelled load's result is dropped instead.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import type { FocusEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection, FillMode } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { PreviewTrackManager } from '../audio/PreviewTrackManager';
import type { BeatmapCard } from '../beatmaps/drawables/cards/BeatmapCard';
import { createBeatmapCard } from '../beatmaps/drawables/cards/createBeatmapCard';
import { ExpandedContentScrollContainer } from '../beatmaps/drawables/cards/ExpandedContentScrollContainer';
import { LinkFlowContainer } from '../graphics/containers/LinkFlowContainer';
import { ReverseChildIDFillFlowContainer } from '../graphics/containers/ReverseChildIDFillFlowContainer';
import { OsuFont } from '../graphics/OsuFont';
import { OsuSpriteText } from '../graphics/sprites/OsuSpriteText';
import type { APIBeatmapSet } from '../online/api/requests/responses/APIBeatmapSet';
import type { BeatmapListingFilterControl, SearchResult } from './beatmapListing/BeatmapListingFilterControl';
import { SearchResultType } from './beatmapListing/BeatmapListingFilterControl';
import { BeatmapListingHeader } from './beatmapListing/BeatmapListingHeader';
import type { SearchGenre } from './beatmapListing/SearchGenre';
import type { SearchLanguage } from './beatmapListing/SearchLanguage';
import { OnlineOverlay } from './OnlineOverlay';
import { OverlayColourScheme } from './OverlayColourScheme';

const time_between_fetches = 500;

export class BeatmapListingOverlay extends OnlineOverlay<BeatmapListingHeader> {
  /** (C#'s previewTrackManager; renamed: OsuFocusedOverlayContainer has a private member of that name) */
  private listingPreviewTrackManager!: PreviewTrackManager;

  private panelTarget!: Container;
  private foundContent: FillFlowContainer<BeatmapCard> | null = null;

  private get filterControl(): BeatmapListingFilterControl {
    return this.header.filterControl;
  }

  constructor() {
    super(OverlayColourScheme.Blue);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.listingPreviewTrackManager = dependencies.resolve(PreviewTrackManager);

    this.child = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
      children: [
        new Container().with({
          autoSizeAxes: Axes.Y,
          relativeSizeAxes: Axes.X,
          children: [
            new Box().with({
              relativeSizeAxes: Axes.Both,
              colour: this.colourProvider.background5,
            }),
            this.panelTarget = new Container().with({
              autoSizeAxes: Axes.Y,
              relativeSizeAxes: Axes.X,
              masking: true,
              padding: MarginPadding.of({ horizontal: 20 }),
            }),
          ],
        }),
      ],
    });

    this.filterControl.typingStarted = () => this.onTypingStarted();
    this.filterControl.searchStarted = () => this.onSearchStarted();
    this.filterControl.searchFinished = result => this.onSearchFinished(result);
    this.filterControl.searchFailed = () => this.loading.hide();
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.filterControl.cardSize.bindValueChanged(() => this.onCardSizeChanged());
  }

  showWithSearch(query: string): void {
    this.filterControl.search(query);
    this.show();
    this.scrollFlow.scrollToStart();
  }

  showWithGenreFilter(genre: SearchGenre): void {
    this.showWithSearch('');
    this.filterControl.filterGenre(genre);
  }

  showWithLanguageFilter(language: SearchLanguage): void {
    this.showWithSearch('');
    this.filterControl.filterLanguage(language);
  }

  protected override createHeader(): BeatmapListingHeader {
    return new BeatmapListingHeader();
  }

  protected override get backgroundColour(): Colour4 {
    return this.colourProvider.background6;
  }

  private onTypingStarted(): void {
    // temporary until the textbox/header is updated to always stay on screen.
    this.scrollFlow.scrollToStart();
  }

  protected override onFocus(e: FocusEvent): void {
    super.onFocus(e);

    this.filterControl.takeFocus();
  }

  /** (C#'s cancellationToken) */
  private cancellationToken: { cancelled: boolean } | null = null;
  /** (panelLoadTask?.IsCompleted != false) */
  private panelLoadCompleted = true;

  private onSearchStarted(): void {
    this.cancelPanelLoad();

    this.listingPreviewTrackManager.stopAnyPlaying(this);

    if (this.panelTarget.children.length > 0)
      this.loading.show();
  }

  private onSearchFinished(searchResult: SearchResult): void {
    this.cancelPanelLoad();

    if (searchResult.type === SearchResultType.SupporterOnlyFilters) {
      const supporterOnly = new SupporterRequiredDrawable(searchResult.supporterOnlyFiltersUsed);
      this.replaceResultsAreaContent(supporterOnly);
      return;
    }

    let newCards = this.createCardsFor(searchResult.results);

    if (this.filterControl.currentPage === 0) {
      //No matches case
      if (newCards.length === 0) {
        this.replaceResultsAreaContent(new NotFoundDrawable());
        return;
      }

      const content = createCardContainerFor(newCards);

      this.foundContent = content;

      const token = this.beginPanelLoad();
      this.trackPanelLoad(token, this.loadComponentAsync(content, loaded => {
        if (!token.cancelled)
          this.replaceResultsAreaContent(loaded);
      }));
    } else {
      // new results may contain beatmaps from a previous page,
      // this is dodgy but matches web behaviour for now.
      // see: https://github.com/ppy/osu-web/issues/9270
      const existing = new Set(this.foundContent?.children.map(c => c.beatmapSet.onlineID) ?? []);
      newCards = newCards.filter(c => !existing.has(c.beatmapSet.onlineID));

      const foundContent = this.foundContent;

      const token = this.beginPanelLoad();
      this.trackPanelLoad(token, this.loadComponentsAsync(newCards, loaded => {
        if (token.cancelled)
          return;

        this.lastFetchDisplayedTime = this.time.current;
        foundContent?.addRange(loaded);
        loaded.forEach(p => p.fadeIn(200, Easing.OutQuint));
      }));
    }
  }

  /** (new CancellationTokenSource() for a panel load: its callbacks check the token, as loads can't be cancelled mid-way) */
  private beginPanelLoad(): { cancelled: boolean } {
    const token = this.cancellationToken = { cancelled: false };
    this.panelLoadCompleted = false;
    return token;
  }

  /** Tracks a panel load like C#'s panelLoadTask (a cancelled task counts as completed). */
  private trackPanelLoad(token: { cancelled: boolean }, task: Promise<unknown>): void {
    void task.finally(() => {
      if (!token.cancelled)
        this.panelLoadCompleted = true;
    });
  }

  private cancelPanelLoad(): void {
    if (this.cancellationToken !== null)
      this.cancellationToken.cancelled = true;

    this.panelLoadCompleted = true;
  }

  private createCardsFor(beatmapSets: APIBeatmapSet[]): BeatmapCard[] {
    return beatmapSets.map(set => createBeatmapCard(set, this.filterControl.cardSize.value).with({
      anchor: Anchor.TopCentre,
      origin: Anchor.TopCentre,
    }));
  }

  private replaceResultsAreaContent(content: Drawable): void {
    this.loading.hide();
    this.lastFetchDisplayedTime = this.time.current;

    this.panelTarget.child = content;

    content.fadeInFromZero();
  }

  private onCardSizeChanged(): void {
    const foundContent = this.foundContent;

    if (foundContent === null || !foundContent.isAlive || foundContent.children.length === 0)
      return;

    this.loading.show();

    const newCards = this.createCardsFor([...foundContent.children].reverse().map(card => card.beatmapSet));

    this.cancelPanelLoad();

    const token = this.beginPanelLoad();
    this.trackPanelLoad(token, this.loadComponentsAsync(newCards, cards => {
      if (token.cancelled)
        return;

      foundContent.clear();
      foundContent.addRange(cards);
      this.loading.hide();
    }));
  }

  protected override disposeInternal(isDisposing: boolean): void {
    this.cancelPanelLoad();

    super.disposeInternal(isDisposing);
  }

  private lastFetchDisplayedTime = 0;

  protected override update(): void {
    super.update();

    const pagination_scroll_distance = 500;

    const shouldShowMore = this.panelLoadCompleted
      && this.time.current - this.lastFetchDisplayedTime > time_between_fetches
      && (this.scrollFlow.scrollableExtent > 0 && this.scrollFlow.isScrolledToEnd(pagination_scroll_distance));

    if (shouldShowMore)
      this.filterControl.fetchNextPage();
  }
}

function createCardContainerFor(newCards: BeatmapCard[]): ReverseChildIDFillFlowContainer<BeatmapCard> {
  // spawn new children with the contained so we only clear old content at the last moment.
  // reverse ID flow is required for correct Z-ordering of the cards' expandable content (last card should be front-most).
  return new ReverseChildIDFillFlowContainer<BeatmapCard>().with({
    relativeSizeAxes: Axes.X,
    autoSizeAxes: Axes.Y,
    spacing: new Vector2(10),
    alpha: 0,
    margin: MarginPadding.of({
      top: 15,
      // the + 20 adjustment is roughly eyeballed in order to fit all of the expanded content height after it's scaled
      // as well as provide visual balance to the top margin.
      bottom: ExpandedContentScrollContainer.HEIGHT + 20,
    }),
    children: newCards,
  });
}

/** (BeatmapListingOverlay.NotFoundDrawable) */
export class NotFoundDrawable extends CompositeDrawable {
  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.height = 250;
    this.alpha = 0;
    this.margin = MarginPadding.of({ top: 15 });
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const texture = await dependencies.resolve(LargeTextureStore).get('Online/not-found');

    this.addInternal(new FillFlowContainer().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      relativeSizeAxes: Axes.Y,
      autoSizeAxes: Axes.X,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(10, 0),
      children: [
        new Sprite().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          relativeSizeAxes: Axes.Both,
          fillMode: FillMode.Fit,
          texture,
        }),
        new OsuSpriteText().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          text: '... nope, nothing found.',
        }),
      ],
    }));
  }
}

// TODO: localisation requires Text/LinkFlowContainer support for localising strings with links inside
// (https://github.com/ppy/osu-framework/issues/4530)
/** (BeatmapListingOverlay.SupporterRequiredDrawable) */
export class SupporterRequiredDrawable extends CompositeDrawable {
  private supporterRequiredText!: LinkFlowContainer;

  private readonly filtersUsed: string[];

  constructor(filtersUsed: string[]) {
    super();

    this.relativeSizeAxes = Axes.X;
    this.height = 225;
    this.alpha = 0;

    this.filtersUsed = filtersUsed;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const texture = await dependencies.resolve(LargeTextureStore).get('Online/supporter-required');

    this.addInternal(new FillFlowContainer().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      relativeSizeAxes: Axes.Y,
      autoSizeAxes: Axes.X,
      direction: FillDirection.Horizontal,
      children: [
        new Sprite().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          relativeSizeAxes: Axes.Both,
          fillMode: FillMode.Fit,
          texture,
        }),
        this.supporterRequiredText = new LinkFlowContainer().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          autoSizeAxes: Axes.Both,
          margin: MarginPadding.of({ bottom: 10 }),
        }),
      ],
    }));

    this.supporterRequiredText.addText(`Filtering by ${this.filtersUsed.join(' and ')} requires an active `, t => {
      t.font = OsuFont.getFont({ size: 16 });
    });

    this.supporterRequiredText.addLink('osu!supporter tag', 'https://osu.ppy.sh/store/products/supporter-tag');
  }
}
