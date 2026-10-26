// Ported from osu.Game/Screens/Select/BeatmapMetadataWedge.cs
// Offline, SongSelect's online lookup always completes without an online beatmap set (as C#'s does without an API), so genre and language read
// "-" and the ratings and fail / retry wedges (SuccessRateDisplay, UserRatingDisplay, RatingSpreadDisplay, FailRetryDisplay) never show; they
// aren't ported. User tags are read from the beatmap's metadata (C# refetches them from realm).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { GameHost } from '@fw/platform/GameHost';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { ShearAligningWrapper } from '../../graphics/containers/ShearAligningWrapper';
import { OsuGame } from '../../OsuGame';
import { ISongSelect } from './ISongSelect';
import { MetadataDisplay } from './BeatmapMetadataWedge.MetadataDisplay';
import { SongSelect } from './SongSelect';
import { WedgeBackground } from './WedgeBackground';

const transition_duration = 300;

export class BeatmapMetadataWedge extends VisibilityContainer {
  private creator!: MetadataDisplay;
  private source!: MetadataDisplay;
  private genre!: MetadataDisplay;
  private language!: MetadataDisplay;
  private userTags!: MetadataDisplay;
  private mapperTags!: MetadataDisplay;
  private submitted!: MetadataDisplay;
  private ranked!: MetadataDisplay;

  protected override get startHidden(): boolean {
    return true;
  }

  private beatmap!: Bindable<WorkingBeatmap>;

  private host!: GameHost;

  private songSelect: ISongSelect | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    this.host = dependencies.resolve(GameHost);
    this.songSelect = dependencies.get(ISongSelect);

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
    this.padding = MarginPadding.of({ top: 4 });

    this.width = 0.9;

    const column = (children: MetadataDisplay[]) => new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
      spacing: new Vector2(0, 10),
      children,
    });

    this.internalChild = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
      spacing: new Vector2(0, 4),
      shear: OsuGame.SHEAR,
      children: [
        new ShearAligningWrapper(new Container().with({
          cornerRadius: 10,
          masking: true,
          relativeSizeAxes: Axes.X,
          autoSizeAxes: Axes.Y,
          children: [
            new WedgeBackground(),
            new Container().with({
              relativeSizeAxes: Axes.X,
              autoSizeAxes: Axes.Y,
              shear: OsuGame.SHEAR.neg(),
              padding: MarginPadding.of({ left: SongSelect.WEDGE_CONTENT_MARGIN, right: 35, vertical: 16 }),
              children: [
                new FillFlowContainer().with({
                  relativeSizeAxes: Axes.X,
                  autoSizeAxes: Axes.Y,
                  direction: FillDirection.Vertical,
                  spacing: new Vector2(0, 10),
                  autoSizeDuration: transition_duration / 3,
                  autoSizeEasing: Easing.OutQuint,
                  children: [
                    new GridContainer().with({
                      relativeSizeAxes: Axes.X,
                      autoSizeAxes: Axes.Y,
                      rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
                      columnDimensions: [
                        new Dimension(),
                        new Dimension(),
                        new Dimension(),
                      ],
                      content: [
                        [
                          column([
                            this.creator = new MetadataDisplay('Creator'),
                            this.genre = new MetadataDisplay('Genre'),
                          ]),
                          column([
                            this.source = new MetadataDisplay('Source'),
                            this.language = new MetadataDisplay('Language'),
                          ]),
                          column([
                            this.submitted = new MetadataDisplay('Submitted'),
                            this.ranked = new MetadataDisplay('Ranked'),
                          ]),
                        ],
                      ],
                    }),
                    this.userTags = new MetadataDisplay('User Tags').with({
                      alpha: 0,
                    }),
                    this.mapperTags = new MetadataDisplay('Mapper Tags'),
                  ],
                }),
              ],
            }),
          ],
        })),
      ],
    });

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.beatmap.bindValueChanged(() => this.scheduler.addOnce(this.updateDisplay));

    this.scheduler.addOnce(this.updateDisplay);
  }

  protected override popIn(): void {
    this.fadeIn(transition_duration, Easing.OutQuint)
      .moveToX(0, transition_duration, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.fadeOut(transition_duration, Easing.OutQuint)
      .moveToX(-100, transition_duration, Easing.OutQuint);
  }

  private readonly updateDisplay = (): void => {
    const metadata = this.beatmap.value.metadata;
    const beatmapSetInfo = this.beatmap.value.beatmapSetInfo;

    // (LinkAction.OpenUserProfile: the user profile overlay isn't ported, so the profile opens on the website, as for the title wedge's mapper.)
    const author = metadata.author;
    this.creator.data = {
      value: author.username,
      linkAction: () => this.host.openUrlExternally(`https://osu.ppy.sh/users/${author.onlineID > 1 ? author.onlineID : encodeURIComponent(author.username)}`),
    };

    if (metadata.source !== '')
      this.source.data = { value: metadata.source, linkAction: () => this.songSelect?.addToSearch(metadata.source) };
    else
      this.source.data = { value: '-', linkAction: null };

    if (metadata.tags !== '')
      this.mapperTags.tags = { tags: metadata.tags.split(' '), searchAction: t => this.songSelect?.addToSearch(t) };
    else
      this.mapperTags.tags = { tags: [], searchAction: () => {} };

    this.submitted.date = beatmapSetInfo.dateSubmitted;
    this.ranked.date = beatmapSetInfo.dateRanked;

    this.updateOnlineDisplay();
  };

  private updateOnlineDisplay(): void {
    // (onlineLookupResult: Completed with no result, see the header.)
    this.genre.data = { value: '-', linkAction: null };
    this.language.data = { value: '-', linkAction: null };

    this.updateUserTags();
  }

  private updateUserTags(): void {
    const tags = this.beatmap.value.metadata.userTags;

    if (tags.length === 0) {
      this.userTags.fadeOut(transition_duration, Easing.OutQuint);
      return;
    }

    this.userTags.fadeIn(transition_duration, Easing.OutQuint);
    this.userTags.tags = { tags, searchAction: tag => this.songSelect?.addToSearch(`tag="${tag}"!`) };
  }
}
