// Ported from osu.Game/Screens/Select/BeatmapTitleWedge.DifficultyDisplay.cs
// Without the difficulty cache (no calculators), the star rating is StarDifficulty(beatmap.StarRating, 0), GetBindableDifficulty's initial
// value. The object counts are the osu! ruleset's (see BeatmapStatistic.ts) and the attributes are Ruleset.GetBeatmapAttributesForDisplay's
// with no mods; there's no link handler, so the mapper link opens the mapper's osu! profile in a new tab.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import type { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { GameHost } from '@fw/platform/GameHost';
import { Easing } from '@fw/transforms/Easing';
import { getOsuStatistics } from '../../beatmaps/BeatmapStatistic';
import { StarRatingDisplay } from '../../beatmaps/drawables/StarRatingDisplay';
import type { StarDifficulty } from '../../beatmaps/StarDifficulty';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { OsuHoverContainer } from '../../graphics/containers/OsuHoverContainer';
import { ShearAligningWrapper } from '../../graphics/containers/ShearAligningWrapper';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { TruncatingSpriteText } from '../../graphics/sprites/TruncatingSpriteText';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { DifficultyStatisticsDisplay, type StatisticDifficultyData } from './BeatmapTitleWedge.StatisticDifficulty';
import { SongSelect } from './SongSelect';
import { WedgeBackground } from './WedgeBackground';

const border_weight = 2;

class MapperLinkContainer extends OsuHoverContainer {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.tooltipText = 'View profile';
    this.idleColour = dependencies.get(OverlayColourProvider)?.light2 ?? dependencies.resolve(OsuColour).blue;

    return r;
  }
}

export class DifficultyDisplay extends CompositeDrawable {
  private beatmap!: Bindable<WorkingBeatmap>;

  private ruleset!: Bindable<RulesetInfo>;

  private host!: GameHost;

  private starRatingDisplay!: StarRatingDisplay;
  private nameLine!: FillFlowContainer;
  private difficultyText!: OsuSpriteText;
  private mappedByText!: OsuSpriteText;
  private mapperLink!: OsuHoverContainer;
  private mapperText!: OsuSpriteText;

  private ratingAndNameContainer!: GridContainer;
  private countStatisticsDisplay!: DifficultyStatisticsDisplay;
  private difficultyStatisticsDisplay!: DifficultyStatisticsDisplay;

  private cancellationSource: { cancelled: boolean } | null = null;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo').getBoundCopy();
    this.host = dependencies.resolve(GameHost);
    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.masking = true;
    this.cornerRadius = 10;
    this.shear = OsuGame.SHEAR;

    this.internalChildren = [
      new WedgeBackground(),
      new FillFlowContainer().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        direction: FillDirection.Vertical,
        children: [
          new ShearAligningWrapper(this.ratingAndNameContainer = new GridContainer().with({
            shear: OsuGame.SHEAR.neg(),
            alwaysPresent: true,
            relativeSizeAxes: Axes.X,
            height: 20,
            margin: MarginPadding.of({ vertical: 5 }),
            padding: MarginPadding.of({ left: SongSelect.WEDGE_CONTENT_MARGIN }),
            rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
            columnDimensions: [
              new Dimension(GridSizeMode.AutoSize),
              new Dimension(GridSizeMode.Absolute, 6),
              new Dimension(),
            ],
            content: [
              [
                this.starRatingDisplay = new StarRatingDisplay({ stars: 0, maxCombo: 0 }, undefined, true).with({
                  anchor: Anchor.CentreLeft,
                  origin: Anchor.CentreLeft,
                }),
                emptyDrawable(),
                this.nameLine = new FillFlowContainer().with({
                  anchor: Anchor.CentreLeft,
                  origin: Anchor.CentreLeft,
                  relativeSizeAxes: Axes.X,
                  autoSizeAxes: Axes.Y,
                  direction: FillDirection.Horizontal,
                  margin: MarginPadding.of({ bottom: 2 }),
                  children: [
                    this.difficultyText = new TruncatingSpriteText().with({
                      anchor: Anchor.BottomLeft,
                      origin: Anchor.BottomLeft,
                      font: withFont(OsuFont.Style.Body, { weight: FontWeight.SemiBold }),
                    }),
                    this.mappedByText = new OsuSpriteText().with({
                      anchor: Anchor.BottomLeft,
                      origin: Anchor.BottomLeft,
                      text: ' mapped by ',
                      font: OsuFont.Style.Body,
                    }),
                    this.mapperLink = new MapperLinkContainer().with({
                      autoSizeAxes: Axes.Both,
                      anchor: Anchor.BottomLeft,
                      origin: Anchor.BottomLeft,
                      child: this.mapperText = new TruncatingSpriteText().with({
                        shadow: true,
                        font: withFont(OsuFont.Style.Body, { weight: FontWeight.SemiBold }),
                      }),
                    }),
                  ],
                }),
              ],
            ],
          })),
          new ShearAligningWrapper(new Container().with({
            shear: OsuGame.SHEAR.neg(),
            relativeSizeAxes: Axes.X,
            height: 53,
            padding: MarginPadding.of({ bottom: border_weight, right: border_weight }),
            child: new Container().with({
              relativeSizeAxes: Axes.X,
              autoSizeAxes: Axes.Y,
              masking: true,
              cornerRadius: 10 - border_weight,
              shear: OsuGame.SHEAR,
              children: [
                new Box().with({
                  relativeSizeAxes: Axes.Both,
                  colour: colourProvider.background5.opacity(0.8),
                }),
                new GridContainer().with({
                  relativeSizeAxes: Axes.X,
                  autoSizeAxes: Axes.Y,
                  padding: MarginPadding.of({ left: SongSelect.WEDGE_CONTENT_MARGIN, right: 20, vertical: 7.5 }),
                  shear: OsuGame.SHEAR.neg(),
                  rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
                  columnDimensions: [
                    new Dimension(),
                    new Dimension(GridSizeMode.Absolute, 30),
                    new Dimension(GridSizeMode.AutoSize),
                  ],
                  content: [
                    [
                      this.countStatisticsDisplay = new DifficultyStatisticsDisplay().with({
                        relativeSizeAxes: Axes.X,
                      }),
                      emptyDrawable(),
                      this.difficultyStatisticsDisplay = new DifficultyStatisticsDisplay(true),
                    ],
                  ],
                }),
              ],
            }),
          })),
        ],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // it is not uncommon for the beatmap and the ruleset to change in conjunction during a single update frame.
    // in that process, it is possible for the global bindable triad (beatmap / ruleset / mods) to briefly be partially invalid in combination.
    // `updateDisplay()` will initiate a difficulty calculation, and if it is allowed to run in that invalid intermediate state, it will loudly fail.
    // therefore, all changes that may initiate a difficulty calculation are debounced until the next frame to ensure the global bindable state is fully consistent -
    // and it's what you'd want to do anyway for performance reasons.
    this.beatmap.bindValueChanged(() => this.scheduler.addOnce(this.updateDisplay));
    this.ruleset.bindValueChanged(() => this.scheduler.addOnce(this.updateDisplay));

    this.updateDifficultyStatistics();

    this.updateDisplay();
  }

  private readonly updateDisplay = (): void => {
    if (this.cancellationSource !== null)
      this.cancellationSource.cancelled = true;
    this.cancellationSource = { cancelled: false };

    const working = this.beatmap.value;

    if (this.beatmap.isDefault) {
      this.ratingAndNameContainer.fadeOut(300, Easing.OutQuint);
      this.countStatisticsDisplay.fadeOut(300, Easing.OutQuint);
    } else {
      this.ratingAndNameContainer.fadeIn(300, Easing.OutQuint);
      this.difficultyText.text = working.beatmapInfo.difficultyName;
      const author = working.metadata.author;
      this.mapperLink.action = () => this.host.openUrlExternally(`https://osu.ppy.sh/users/${author.onlineID > 1 ? author.onlineID : encodeURIComponent(author.username)}`);
      this.mapperText.text = author.username;
    }

    this.starRatingDisplay.current = new Bindable<StarDifficulty>({ stars: working.beatmapInfo.starRating, maxCombo: 0 });

    this.updateCountStatistics(this.cancellationSource);
    this.updateDifficultyStatistics();
  };

  private updateCountStatistics(cancellation: { cancelled: boolean }): void {
    if (this.beatmap.isDefault) {
      this.countStatisticsDisplay.fadeOut(300, Easing.OutQuint);
      return;
    }

    // (GetPlayableBeatmap: the decoded beatmap, see BeatmapStatistic.ts)
    void this.beatmap.value.loadBeatmapAsync().then(playableBeatmap => {
      if (playableBeatmap === null)
        return;

      const statistics: StatisticDifficultyData[] = getOsuStatistics(playableBeatmap)
        .map(s => ({ label: s.name, value: s.barDisplayLength ?? 0, adjustedValue: s.barDisplayLength ?? 0, maximum: 1, content: s.content }));

      this.schedule(() => {
        if (cancellation.cancelled)
          return;

        this.countStatisticsDisplay.fadeIn(200, Easing.OutQuint);
        this.countStatisticsDisplay.statistics = statistics;
      });
    });
  }

  private readonly updateDifficultyStatisticsNow = (): void => {
    if (this.beatmap.isDefault || this.ruleset.value == null) {
      this.difficultyStatisticsDisplay.statistics = [];
      return;
    }

    // (Ruleset.GetBeatmapAttributesForDisplay with no mods: original and adjusted values are equal)
    const d = this.beatmap.value.beatmapInfo.difficulty;
    const attribute = (label: string, value: number): StatisticDifficultyData => ({ label, value, adjustedValue: value, maximum: 10 });

    this.difficultyStatisticsDisplay.statistics = [
      attribute('Circle Size', d.circleSize),
      attribute('Approach Rate', d.approachRate),
      attribute('Accuracy', d.overallDifficulty),
      attribute('HP Drain', d.drainRate),
    ];
  };

  private updateDifficultyStatistics(): void {
    this.scheduler.addOnce(this.updateDifficultyStatisticsNow);
  }

  protected override update(): void {
    super.update();

    this.difficultyText.maxWidth = Math.max(this.nameLine.drawWidth - this.mappedByText.drawWidth - this.mapperText.drawWidth - 20, 0);

    // Use difficulty colour until it gets too dark to be visible against dark backgrounds.
    const col: Colour4 = this.starRatingDisplay.displayedStars.value >= OsuColour.STAR_DIFFICULTY_DEFINED_COLOUR_CUTOFF
      ? this.starRatingDisplay.displayedDifficultyTextColour
      : this.starRatingDisplay.displayedDifficultyColour;

    this.difficultyText.colour = col;
    this.mappedByText.colour = col;
    this.countStatisticsDisplay.accentColour = col;
    this.difficultyStatisticsDisplay.accentColour = col;
  }
}
