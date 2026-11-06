// Ported from osu.Game/Screens/Select/BeatmapMetadataWedge.cs
// SongSelect's online lookup comes from a mirror (GetBeatmapSetRequest). There is no osu! API login, so C#'s API state binding (which only
// re-runs updateDisplay) isn't needed. User tags are read from the beatmap's metadata (C# refetches them from realm).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { Visibility, VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { RNG } from '@fw/utils/RNG';
import { GameHost } from '@fw/platform/GameHost';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { ShearAligningWrapper } from '../../graphics/containers/ShearAligningWrapper';
import { OsuGame } from '../../OsuGame';
import { OsuGameBase } from '../../OsuGameBase';
import { ISongSelect } from './ISongSelect';
import { MetadataDisplay } from './BeatmapMetadataWedge.MetadataDisplay';
import { BeatmapSetLookupStatus, type BeatmapSetLookupResult, SongSelect } from './SongSelect';
import { FailRetryDisplay } from './BeatmapMetadataWedge.FailRetryDisplay';
import { RatingSpreadDisplay } from './BeatmapMetadataWedge.RatingSpreadDisplay';
import { SuccessRateDisplay } from './BeatmapMetadataWedge.SuccessRateDisplay';
import { UserRatingDisplay } from './BeatmapMetadataWedge.UserRatingDisplay';
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

  private ratingsWedge!: Drawable;
  private successRateDisplay!: SuccessRateDisplay;
  private userRatingDisplay!: UserRatingDisplay;
  private ratingSpreadDisplay!: RatingSpreadDisplay;

  private failRetryWedge!: Drawable;
  private failRetryDisplay!: FailRetryDisplay;

  get ratingsVisible(): boolean {
    return this.ratingsWedge.alpha > 0;
  }

  get failRetryVisible(): boolean {
    return this.failRetryWedge.alpha > 0;
  }

  private onlineLookupResult!: Bindable<BeatmapSetLookupResult | null>;

  private wedgeAppearSample: Sample | null = null;
  private wedgeHideSample: Sample | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    this.host = dependencies.resolve(GameHost);
    this.songSelect = dependencies.get(ISongSelect);
    this.onlineLookupResult = dependencies.resolve(Bindable<BeatmapSetLookupResult | null>, 'BeatmapSetLookupResult').getBoundCopy();

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
        new ShearAligningWrapper(this.ratingsWedge = new Container().with({
          alpha: 0,
          cornerRadius: 10,
          masking: true,
          relativeSizeAxes: Axes.X,
          autoSizeAxes: Axes.Y,
          children: [
            new WedgeBackground(),
            new GridContainer().with({
              relativeSizeAxes: Axes.X,
              autoSizeAxes: Axes.Y,
              shear: OsuGame.SHEAR.neg(),
              rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
              columnDimensions: [
                new Dimension(),
                new Dimension(GridSizeMode.Absolute, 10),
                new Dimension(),
                new Dimension(GridSizeMode.Absolute, 10),
                new Dimension(),
              ],
              padding: MarginPadding.of({ left: SongSelect.WEDGE_CONTENT_MARGIN, right: 40, vertical: 16 }),
              content: [
                [
                  this.successRateDisplay = new SuccessRateDisplay(),
                  emptyDrawable(),
                  this.userRatingDisplay = new UserRatingDisplay(),
                  emptyDrawable(),
                  this.ratingSpreadDisplay = new RatingSpreadDisplay(),
                ],
              ],
            }),
          ],
        })),
        new ShearAligningWrapper(this.failRetryWedge = new Container().with({
          alpha: 0,
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
              padding: MarginPadding.of({ left: SongSelect.WEDGE_CONTENT_MARGIN, right: 40, vertical: 16 }),
              child: this.failRetryDisplay = new FailRetryDisplay(),
            }),
          ],
        })),
      ],
    });

    const audio = dependencies.resolve(AudioManager);
    void audio.samples.get('SongSelect/metadata-wedge-pop-in').then(s => this.wedgeAppearSample = s);
    void audio.samples.get('SongSelect/metadata-wedge-pop-out').then(s => this.wedgeHideSample = s);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.beatmap.bindValueChanged(() => this.scheduler.addOnce(this.updateDisplay));
    this.onlineLookupResult.bindValueChanged(() => this.scheduler.addOnce(this.updateDisplay));

    // (apiState.BindValueChanged(..., true))
    this.scheduler.addOnce(this.updateDisplay);
  }

  protected override popIn(): void {
    this.fadeIn(transition_duration, Easing.OutQuint)
      .moveToX(0, transition_duration, Easing.OutQuint);

    this.updateSubWedgeVisibility();
  }

  protected override popOut(): void {
    this.fadeOut(transition_duration, Easing.OutQuint)
      .moveToX(-100, transition_duration, Easing.OutQuint);

    this.updateSubWedgeVisibility();
  }

  private updateSubWedgeVisibility(): void {
    // We could consider hiding individual wedges based on zero data in the future.
    // Needs some experimentation on what looks good.

    const beatmapInfo = this.beatmap.value.beatmapInfo;
    const currentOnlineBeatmap = this.onlineLookupResult.value?.result?.beatmaps.find(b => b.onlineID === beatmapInfo.onlineID) ?? null;

    if (this.state.value === Visibility.Visible && currentOnlineBeatmap !== null) {
      // play show sounds only if the wedges were previously hidden
      if (this.ratingsWedge.alpha < 1)
        this.playWedgeAppearSound();

      this.ratingsWedge.fadeIn(transition_duration, Easing.OutQuint)
        .moveToX(0, transition_duration, Easing.OutQuint);

      this.failRetryWedge.delay(100)
        .fadeIn(transition_duration, Easing.OutQuint)
        .moveToX(0, transition_duration, Easing.OutQuint);
    } else {
      // play hide sounds only if the wedges were previously visible
      if (this.ratingsWedge.alpha > 0)
        this.playWedgeHideSound();

      this.failRetryWedge.fadeOut(transition_duration, Easing.OutQuint)
        .moveToX(-50, transition_duration, Easing.OutQuint);

      this.ratingsWedge.delay(100)
        .fadeOut(transition_duration, Easing.OutQuint)
        .moveToX(-50, transition_duration, Easing.OutQuint);
    }
  }

  private playWedgeAppearSound(): void {
    const wedgeAppearChannel1 = this.wedgeAppearSample?.getChannel();
    if (wedgeAppearChannel1 === undefined)
      return;

    wedgeAppearChannel1.balance.value = -OsuGameBase.SFX_STEREO_STRENGTH / 2;
    wedgeAppearChannel1.frequency.value = Math.fround(0.98) + RNG.nextDouble(Math.fround(0.04));
    wedgeAppearChannel1.play();

    this.scheduler.addDelayed(() => {
      const wedgeAppearChannel2 = this.wedgeAppearSample?.getChannel();
      if (wedgeAppearChannel2 === undefined)
        return;

      wedgeAppearChannel2.balance.value = -OsuGameBase.SFX_STEREO_STRENGTH / 2;
      wedgeAppearChannel2.frequency.value = Math.fround(0.90) + RNG.nextDouble(Math.fround(0.05));
      wedgeAppearChannel2.play();
    }, 100);
  }

  private playWedgeHideSound(): void {
    const wedgeHideChannel = this.wedgeHideSample?.getChannel();
    if (wedgeHideChannel === undefined)
      return;

    wedgeHideChannel.balance.value = -OsuGameBase.SFX_STEREO_STRENGTH / 2;
    wedgeHideChannel.play();
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
    if (this.onlineLookupResult.value?.status !== BeatmapSetLookupStatus.Completed) {
      this.genre.data = null;
      this.language.data = null;
      this.userTags.tags = null;
      return;
    }

    const onlineBeatmapSet = this.onlineLookupResult.value.result;

    if (onlineBeatmapSet === null) {
      this.genre.data = { value: '-', linkAction: null };
      this.language.data = { value: '-', linkAction: null };
    } else {
      const beatmapInfo = this.beatmap.value.beatmapInfo;
      const onlineBeatmap = onlineBeatmapSet.beatmaps.find(b => b.onlineID === beatmapInfo.onlineID) ?? null;

      this.genre.data = { value: onlineBeatmapSet.genre.name, linkAction: () => this.songSelect?.addToSearch(onlineBeatmapSet.genre.name) };
      this.language.data = { value: onlineBeatmapSet.language.name, linkAction: () => this.songSelect?.addToSearch(onlineBeatmapSet.language.name) };

      if (onlineBeatmap !== null) {
        this.userRatingDisplay.data = onlineBeatmapSet.ratings;
        this.ratingSpreadDisplay.data = onlineBeatmapSet.ratings;
        this.successRateDisplay.data = { passes: onlineBeatmap.passCount, plays: onlineBeatmap.playCount };
        this.failRetryDisplay.data = onlineBeatmap.failTimes ?? { fails: null, retries: null };
      }
    }

    this.updateUserTags();
    this.updateSubWedgeVisibility();
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
