// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapCardExtra.cs (context menu items aren't ported).

import { type IReadOnlyDependencyContainer, DependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { romanisable } from '@fw/localisation/RomanisableString';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { LinkFlowContainer } from '../../../graphics/containers/LinkFlowContainer';
import { FontWeight, OsuFont, withFont } from '../../../graphics/OsuFont';
import { TruncatingSpriteText } from '../../../graphics/sprites/TruncatingSpriteText';
import type { APIBeatmapSet } from '../../../online/api/requests/responses/APIBeatmapSet';
import { ExplicitContentBeatmapBadge } from '../../../overlays/beatmapSet/ExplicitContentBeatmapBadge';
import { FeaturedArtistBeatmapBadge } from '../../../overlays/beatmapSet/FeaturedArtistBeatmapBadge';
import { SpotlightBeatmapBadge } from '../../../overlays/beatmapSet/SpotlightBeatmapBadge';
import { OverlayColourProvider } from '../../../overlays/OverlayColourProvider';
import { BeatmapCard } from './BeatmapCard';
import { BeatmapCardContent } from './BeatmapCardContent';
import { BeatmapCardDifficultyList } from './BeatmapCardDifficultyList';
import { BeatmapCardDownloadProgressBar } from './BeatmapCardDownloadProgressBar';
import { BeatmapCardExtraInfoRow } from './BeatmapCardExtraInfoRow';
import { BeatmapCardThumbnail } from './BeatmapCardThumbnail';
import { CollapsibleButtonContainer } from './CollapsibleButtonContainer';
import { BeatmapCardDateStatistic } from './statistics/BeatmapCardDateStatistic';
import type { BeatmapCardStatistic } from './statistics/BeatmapCardStatistic';
import { FavouritesStatistic } from './statistics/FavouritesStatistic';
import { HypesStatistic } from './statistics/HypesStatistic';
import { NominationsStatistic } from './statistics/NominationsStatistic';
import { PlayCountStatistic } from './statistics/PlayCountStatistic';
import { StoryboardIconPill } from './StoryboardIconPill';
import { VideoIconPill } from './VideoIconPill';

const height = 112;

export class BeatmapCardExtra extends BeatmapCard {
  protected override get idleContent(): Drawable {
    return this.idleBottomContent;
  }

  protected override get downloadInProgressContent(): Drawable {
    return this.downloadProgressBar;
  }


  /** [Cached] */
  private readonly cardContent: BeatmapCardContent;

  private thumbnail!: BeatmapCardThumbnail;
  private buttonContainer!: CollapsibleButtonContainer;
  private statisticsContainer!: GridContainer;
  private idleBottomContent!: FillFlowContainer;
  private downloadProgressBar!: BeatmapCardDownloadProgressBar;

  constructor(beatmapSet: APIBeatmapSet, allowExpansion = true) {
    super(beatmapSet, allowExpansion);

    this.cardContent = new BeatmapCardContent(height);

    this.action = () => this.defaultAction();
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cache(this.cardContent);
    return dependencies;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.width = BeatmapCard.WIDTH;
    this.height = height;

    let leftIconArea!: FillFlowContainer;
    let titleBadgeArea!: FillFlowContainer;
    let artistContainer!: GridContainer;
    let artistText!: TruncatingSpriteText;

    const mappedBy = new LinkFlowContainer(s => {
      s.shadow = false;
      s.font = OsuFont.getFont({ size: 11, weight: FontWeight.SemiBold });
    }).with({
      autoSizeAxes: Axes.Both,
      margin: MarginPadding.of({ top: 1 }),
    });
    mappedBy.addText('mapped by ', t => t.colour = colourProvider.content2);
    mappedBy.addUserLink(this.beatmapSet.author);

    this.buttonContainer = new CollapsibleButtonContainer(this.beatmapSet).with({
      x: height - BeatmapCard.CORNER_RADIUS,
      width: BeatmapCard.WIDTH - height + BeatmapCard.CORNER_RADIUS,
      buttonsCollapsedWidth: BeatmapCard.CORNER_RADIUS,
      buttonsExpandedWidth: 24,
    });
    this.buttonContainer.favouriteState.bindTarget = this.favouriteState;

    this.downloadProgressBar = new BeatmapCardDownloadProgressBar().with({
      relativeSizeAxes: Axes.X,
      height: 5,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
    });
    this.downloadProgressBar.state.bindTarget = this.downloadTracker.state;
    this.downloadProgressBar.progress.bindTarget = this.downloadTracker.progress;

    this.buttonContainer.children = [
      new FillFlowContainer().with({
        relativeSizeAxes: Axes.Both,
        direction: FillDirection.Vertical,
        children: [
          new GridContainer().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            columnDimensions: [
              new Dimension(),
              new Dimension(GridSizeMode.AutoSize),
            ],
            rowDimensions: [
              new Dimension(GridSizeMode.AutoSize),
            ],
            content: [
              [
                new TruncatingSpriteText().with({
                  text: romanisable(this.beatmapSet.titleUnicode, this.beatmapSet.title),
                  font: withFont(OsuFont.Default, { size: 18, weight: FontWeight.SemiBold }),
                  relativeSizeAxes: Axes.X,
                }),
                titleBadgeArea = new FillFlowContainer().with({
                  anchor: Anchor.BottomRight,
                  origin: Anchor.BottomRight,
                  autoSizeAxes: Axes.Both,
                  direction: FillDirection.Horizontal,
                }),
              ],
            ],
          }),
          artistContainer = new GridContainer().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            columnDimensions: [
              new Dimension(),
              new Dimension(GridSizeMode.AutoSize),
            ],
            rowDimensions: [
              new Dimension(GridSizeMode.AutoSize),
            ],
            content: [
              [
                artistText = new TruncatingSpriteText().with({
                  text: this.createArtistText(),
                  font: withFont(OsuFont.Default, { size: 14, weight: FontWeight.SemiBold }),
                  relativeSizeAxes: Axes.X,
                }),
                emptyDrawable(),
              ],
            ],
          }),
          new TruncatingSpriteText().with({
            relativeSizeAxes: Axes.X,
            text: this.beatmapSet.source,
            shadow: false,
            font: OsuFont.getFont({ size: 11, weight: FontWeight.SemiBold }),
            colour: colourProvider.content2,
          }),
        ],
      }),
      new Container().with({
        name: 'Bottom content',
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        anchor: Anchor.BottomLeft,
        origin: Anchor.BottomLeft,
        children: [
          this.idleBottomContent = new FillFlowContainer().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            direction: FillDirection.Vertical,
            spacing: new Vector2(0, 2),
            alwaysPresent: true,
            children: [
              mappedBy,
              this.statisticsContainer = new GridContainer().with({
                relativeSizeAxes: Axes.X,
                autoSizeAxes: Axes.Y,
                rowDimensions: [
                  new Dimension(GridSizeMode.AutoSize),
                  new Dimension(GridSizeMode.AutoSize),
                ],
                columnDimensions: [
                  new Dimension(GridSizeMode.AutoSize),
                  new Dimension(GridSizeMode.AutoSize),
                  new Dimension(),
                ],
                content: this.createStatistics(),
              }),
              new BeatmapCardExtraInfoRow(this.beatmapSet),
            ],
          }),
          this.downloadProgressBar,
        ],
      }),
    ];

    this.cardContent.mainContent = new Container().with({
      relativeSizeAxes: Axes.Both,
      children: [
        this.thumbnail = new BeatmapCardThumbnail(this.beatmapSet, this.beatmapSet).with({
          name: 'Left (icon) area',
          size: new Vector2(height),
          padding: MarginPadding.of({ right: BeatmapCard.CORNER_RADIUS }),
          child: leftIconArea = new FillFlowContainer().with({
            margin: new MarginPadding(4),
            autoSizeAxes: Axes.Both,
            direction: FillDirection.Horizontal,
            spacing: new Vector2(1),
          }),
        }),
        this.buttonContainer,
      ],
    });

    this.cardContent.expandedContent = new Container().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      padding: MarginPadding.of({ horizontal: 8, vertical: 10 }),
      child: new BeatmapCardDifficultyList(this.beatmapSet),
    });

    this.cardContent.expanded.bindTarget = this.expanded;

    this.child = this.cardContent;

    if (this.beatmapSet.hasVideo)
      leftIconArea.add(new VideoIconPill());

    if (this.beatmapSet.hasStoryboard)
      leftIconArea.add(new StoryboardIconPill());

    if (this.beatmapSet.featuredInSpotlight) {
      titleBadgeArea.add(new SpotlightBeatmapBadge().with({
        anchor: Anchor.BottomRight,
        origin: Anchor.BottomRight,
        margin: MarginPadding.of({ left: 4 }),
      }));
    }

    if (this.beatmapSet.hasExplicitContent) {
      titleBadgeArea.add(new ExplicitContentBeatmapBadge().with({
        anchor: Anchor.BottomRight,
        origin: Anchor.BottomRight,
        margin: MarginPadding.of({ left: 4 }),
      }));
    }

    if (this.beatmapSet.trackId !== null) {
      // (artistContainer.Content[0][1] = ...)
      artistContainer.content = [[artistText, new FeaturedArtistBeatmapBadge().with({
        anchor: Anchor.BottomRight,
        origin: Anchor.BottomRight,
        margin: MarginPadding.of({ left: 4 }),
      })]];
    }

    return r;
  }

  private createArtistText(): string {
    const romanisableArtist = romanisable(this.beatmapSet.artistUnicode, this.beatmapSet.artist);
    return `by ${romanisableArtist}`;
  }

  /** (C# fills the grid's empty 2x3 Content after creating it) */
  private createStatistics(): (Drawable | null)[][] {
    const content: (Drawable | null)[][] = [[null, null, null], [null, null, null]];

    const withMargin = (original: BeatmapCardStatistic): BeatmapCardStatistic => {
      original.margin = MarginPadding.of({ right: 8 });
      return original;
    };

    const hypesStatistic = HypesStatistic.createFor(this.beatmapSet);
    if (hypesStatistic !== null)
      content[0][0] = withMargin(hypesStatistic);

    const nominationsStatistic = NominationsStatistic.createFor(this.beatmapSet);
    if (nominationsStatistic !== null)
      content[1][0] = withMargin(nominationsStatistic);

    content[0][1] = withMargin(new PlayCountStatistic(this.beatmapSet));

    const favourites = new FavouritesStatistic(this.beatmapSet);
    favourites.current = this.favouriteState;
    content[1][1] = withMargin(favourites);

    const dateStatistic = BeatmapCardDateStatistic.createFor(this.beatmapSet);
    if (dateStatistic !== null)
      content[0][2] = withMargin(dateStatistic);

    return content;
  }

  protected override updateState(): void {
    super.updateState();

    const showDetails = this.isHovered || this.expanded.value;

    this.buttonContainer.showDetails.value = showDetails;
    this.thumbnail.dimmed.value = showDetails;
  }
}
