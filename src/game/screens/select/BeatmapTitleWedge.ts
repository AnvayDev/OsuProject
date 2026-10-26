// Ported from osu.Game/Screens/Select/BeatmapTitleWedge.cs
// Mods aren't ported (rate 1) and neither is the online lookup: offline, C#'s lookup completes without a result, which is the state shown
// (play count "-", favourite button empty).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { romanisable } from '@fw/localisation/RomanisableString';
import { Easing } from '@fw/transforms/Easing';
import { BeatmapExtensions } from '../../beatmaps/Beatmap';
import { BeatmapSetOnlineStatusPill } from '../../beatmaps/drawables/BeatmapSetOnlineStatusPill';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { toFormattedDuration } from '../../extensions/TimeDisplayExtensions';
import { OsuHoverContainer } from '../../graphics/containers/OsuHoverContainer';
import { ShearAligningWrapper } from '../../graphics/containers/ShearAligningWrapper';
import { OsuFont } from '../../graphics/OsuFont';
import { OsuIcon } from '../../graphics/OsuIcon';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OsuGame } from '../../OsuGame';
import { MarqueeContainer } from '../../overlays/MarqueeContainer';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { mathRound } from '@fw/utils/DotNet';
import { roundBPM } from '../../utils/FormatUtils';
import { DifficultyDisplay } from './BeatmapTitleWedge.DifficultyDisplay';
import { FavouriteButton } from './BeatmapTitleWedge.FavouriteButton';
import { Statistic, StatisticPlayCount } from './BeatmapTitleWedge.Statistic';
import { ISongSelect } from './ISongSelect';
import { SongSelect } from './SongSelect';
import { WedgeBackground } from './WedgeBackground';

const corner_radius = 10;

export class BeatmapTitleWedge extends VisibilityContainer {
  private working!: Bindable<WorkingBeatmap>;

  private ruleset!: Bindable<RulesetInfo>;

  topPadding = 0;

  protected override get startHidden(): boolean {
    return true;
  }

  private statusPill!: BeatmapSetOnlineStatusPill;
  private titleLink!: OsuHoverContainer;
  private titleLabel!: MarqueeContainer;
  private artistLink!: OsuHoverContainer;
  private artistLabel!: MarqueeContainer;

  /** @internal */
  displayedTitle = '';
  /** @internal */
  displayedArtist = '';

  private playCount!: StatisticPlayCount;
  private favouriteButton!: FavouriteButton;
  private lengthStatistic!: Statistic;
  private bpmStatistic!: Statistic;

  private songSelect: ISongSelect | null = null;

  private statisticsFlow!: FillFlowContainer;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.working = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo').getBoundCopy();
    this.songSelect = dependencies.get(ISongSelect);

    this.masking = true;
    this.cornerRadius = corner_radius;

    this.internalChildren = [
      new WedgeBackground(),
      new FillFlowContainer().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        direction: FillDirection.Vertical,
        padding: MarginPadding.of({
          top: SongSelect.WEDGE_CONTENT_MARGIN + this.topPadding,
          left: SongSelect.WEDGE_CONTENT_MARGIN,
        }),
        spacing: new Vector2(0, 4),
        children: [
          new ShearAligningWrapper(this.statusPill = new BeatmapSetOnlineStatusPill().with({
            shear: OsuGame.SHEAR.neg(),
            showUnknownStatus: true,
            textSize: OsuFont.Style.Caption1.size,
            textPadding: MarginPadding.of({ horizontal: 6, vertical: 1 }),
          })),
          new ShearAligningWrapper(new Container().with({
            shear: OsuGame.SHEAR.neg(),
            relativeSizeAxes: Axes.X,
            height: OsuFont.Style.Title.size,
            margin: MarginPadding.of({ bottom: -4 }),
            child: this.titleLink = new OsuHoverContainer().with({
              relativeSizeAxes: Axes.X,
              autoSizeAxes: Axes.Y,
              child: this.titleLabel = new MarqueeContainer().with({
                overflowSpacing: 50,
              }),
            }),
          })),
          new ShearAligningWrapper(new Container().with({
            shear: OsuGame.SHEAR.neg(),
            relativeSizeAxes: Axes.X,
            height: OsuFont.Style.Heading2.size,
            margin: MarginPadding.of({ left: 1 }),
            child: this.artistLink = new OsuHoverContainer().with({
              relativeSizeAxes: Axes.X,
              autoSizeAxes: Axes.Y,
              child: this.artistLabel = new MarqueeContainer().with({
                overflowSpacing: 50,
              }),
            }),
          })),
          new ShearAligningWrapper(this.statisticsFlow = new FillFlowContainer().with({
            shear: OsuGame.SHEAR.neg(),
            autoSizeAxes: Axes.X,
            height: 30,
            direction: FillDirection.Horizontal,
            spacing: new Vector2(2, 0),
            children: [
              this.playCount = new StatisticPlayCount(true, SongSelect.WEDGE_CONTENT_MARGIN, 50).with({
                margin: MarginPadding.of({ left: -SongSelect.WEDGE_CONTENT_MARGIN }),
              }),
              this.favouriteButton = new FavouriteButton(),
              this.lengthStatistic = new Statistic(OsuIcon.Clock),
              this.bpmStatistic = new Statistic(OsuIcon.Metronome).with({
                tooltipText: 'BPM',
                margin: MarginPadding.of({ left: 5 }),
              }),
            ],
          })),
          new ShearAligningWrapper(new Container().with({
            shear: OsuGame.SHEAR.neg(),
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            margin: MarginPadding.of({ left: -SongSelect.WEDGE_CONTENT_MARGIN }),
            padding: MarginPadding.of({ right: -SongSelect.WEDGE_CONTENT_MARGIN }),
            child: new DifficultyDisplay(),
          })),
        ],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.working.bindValueChanged(() => this.updateDisplay());
    this.ruleset.bindValueChanged(() => this.updateDisplay());

    this.updateDisplay();

    this.statisticsFlow.autoSizeDuration = 100;
    this.statisticsFlow.autoSizeEasing = Easing.OutQuint;
  }

  protected override popIn(): void {
    this.moveToX(0, SongSelect.ENTER_DURATION, Easing.OutQuint)
      .fadeIn(SongSelect.ENTER_DURATION / 3, Easing.In);
  }

  protected override popOut(): void {
    this.moveToX(-150, SongSelect.ENTER_DURATION, Easing.OutQuint)
      .fadeOut(SongSelect.ENTER_DURATION / 3, Easing.In);
  }

  private updateDisplay(): void {
    const metadata = this.working.value.metadata;
    const beatmapInfo = this.working.value.beatmapInfo;

    this.statusPill.status = beatmapInfo.status;

    const titleText = romanisable(metadata.titleUnicode, metadata.title);
    this.titleLabel.createContent = () => new OsuSpriteText().with({
      text: titleText,
      shadow: true,
      font: OsuFont.Style.Title,
    });
    this.titleLink.action = () => this.songSelect?.addToSearch(titleText);
    this.displayedTitle = titleText;

    const artistText = romanisable(metadata.artistUnicode, metadata.artist);
    this.artistLabel.createContent = () => new OsuSpriteText().with({
      text: artistText,
      shadow: true,
      font: OsuFont.Style.Heading2,
    });
    this.artistLink.action = () => this.songSelect?.addToSearch(artistText);
    this.displayedArtist = artistText;

    this.updateLengthAndBpmStatistics();
    this.updateOnlineDisplay();
  }

  private lengthBpmCancellationSource: { cancelled: boolean } | null = null;

  private updateLengthAndBpmStatistics(): void {
    if (this.lengthBpmCancellationSource !== null)
      this.lengthBpmCancellationSource.cancelled = true;
    const token = this.lengthBpmCancellationSource = { cancelled: false };

    const working = this.working.value;
    const beatmapInfo = working.beatmapInfo;

    void working.loadBeatmapAsync().then(beatmap => {
      if (beatmap === null)
        return;

      // (ModUtils.CalculateRateWithMods: no mods)
      const rate = 1;

      const bpmMax = roundBPM(beatmap.controlPointInfo.bpmMaximum, rate);
      const bpmMin = roundBPM(beatmap.controlPointInfo.bpmMinimum, rate);
      const mostCommonBPM = roundBPM(60000 / beatmap.getMostCommonBeatLength(), rate);

      const drainLength = mathRound(BeatmapExtensions.calculateDrainLength(beatmap) / rate);
      const hitLength = mathRound(beatmapInfo.length / rate);

      this.schedule(() => {
        if (token.cancelled)
          return;

        this.lengthStatistic.text = toFormattedDuration(hitLength);
        this.lengthStatistic.tooltipText = `Length (Drain length: ${toFormattedDuration(drainLength)})`;

        this.bpmStatistic.text = bpmMin === bpmMax
          ? `${bpmMin}`
          : `${bpmMin}-${bpmMax} (mostly ${mostCommonBPM})`;
      });
    });
  }

  private updateOnlineDisplay(): void {
    // (the lookup always completes without an online beatmap set)
    this.playCount.value = { total: -1, user: -1 };
    this.favouriteButton.setBeatmapSet();
  }
}
