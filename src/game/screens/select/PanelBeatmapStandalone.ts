// Ported from osu.Game/Screens/Select/PanelBeatmapStandalone.cs
// As PanelBeatmap: no context menus, no difficulty cache (StarDifficulty(beatmap.StarRating, 0)) and no ruleset variants. PanelUpdateBeatmapButton
// is left out as in PanelBeatmapSet (never present without online metadata).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { romanisable } from '@fw/localisation/RomanisableString';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { BeatmapManager } from '../../beatmaps/BeatmapManager';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import { BeatmapSetOnlineStatusPill } from '../../beatmaps/drawables/BeatmapSetOnlineStatusPill';
import { StarRatingDisplay, StarRatingDisplaySize } from '../../beatmaps/drawables/StarRatingDisplay';
import { CarouselItem } from '../../graphics/carousel/CarouselItem';
import { ConstrainedIconContainer } from '../../graphics/containers/ConstrainedIconContainer';
import { FontWeight, OsuFont, Typeface, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { GroupedBeatmap } from './GroupDefinition';
import { Panel } from './Panel';
import { createRulesetIcon } from './PanelBeatmapSet.SpreadDisplay';
import { SpreadDisplay } from './PanelBeatmapStandalone.SpreadDisplay';
import { PanelLocalRankDisplay } from './PanelLocalRankDisplay';
import { PanelSetBackground } from './PanelSetBackground';

export class PanelBeatmapStandalone extends Panel {
  static readonly HEIGHT = Math.fround(CarouselItem.DEFAULT_HEIGHT * Math.fround(1.6));

  private colourProvider!: OverlayColourProvider;

  private beatmaps!: BeatmapManager;

  private beatmapBackground!: PanelSetBackground;
  private scheduledBackgroundRetrieval: ScheduledDelegate | null = null;

  private titleText!: OsuSpriteText;
  private artistText!: OsuSpriteText;
  private statusPill!: BeatmapSetOnlineStatusPill;

  private difficultyIcon!: ConstrainedIconContainer;
  private starRatingDisplay!: StarRatingDisplay;
  private spreadDisplay!: SpreadDisplay;
  private localRank!: PanelLocalRankDisplay;
  private keyCountText!: OsuSpriteText;
  private difficultyText!: OsuSpriteText;
  private authorText!: OsuSpriteText;
  private mainFill!: FillFlowContainer;

  private backgroundBorder!: Box;

  private get beatmap(): BeatmapInfo {
    return (this.item!.model as GroupedBeatmap).beatmap;
  }

  protected override get isBeatmapPanel(): boolean {
    return true;
  }

  constructor() {
    super();

    this.panelXOffset = 20;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    this.beatmaps = dependencies.resolve(BeatmapManager);

    this.height = PanelBeatmapStandalone.HEIGHT;

    this.icon = this.difficultyIcon = new ConstrainedIconContainer().with({
      size: new Vector2(12),
      margin: MarginPadding.of({ left: 4, right: 3 }),
      colour: this.colourProvider.background5,
    });

    this.background = this.backgroundBorder = new Box().with({
      relativeSizeAxes: Axes.Both,
    });

    this.content.children = [
      this.beatmapBackground = new PanelSetBackground(),
      new FillFlowContainer().with({
        autoSizeAxes: Axes.Both,
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        spacing: new Vector2(5),
        margin: MarginPadding.of({ left: 6.5 }),
        direction: FillDirection.Horizontal,
        children: [
          this.localRank = new PanelLocalRankDisplay().with({
            scale: new Vector2(0.8),
            origin: Anchor.CentreLeft,
            anchor: Anchor.CentreLeft,
          }),
          this.mainFill = new FillFlowContainer().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            direction: FillDirection.Vertical,
            padding: MarginPadding.of({ bottom: 4.8 }),
            autoSizeAxes: Axes.Both,
            children: [
              this.titleText = new OsuSpriteText().with({
                font: withFont(OsuFont.Style.Heading2, { typeface: Typeface.TorusAlternate, weight: FontWeight.Bold }),
              }),
              this.artistText = new OsuSpriteText().with({
                font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.SemiBold }),
                padding: MarginPadding.of({ top: -2 }),
              }),
              new FillFlowContainer().with({
                direction: FillDirection.Horizontal,
                autoSizeAxes: Axes.Both,
                padding: MarginPadding.of({ top: 2, bottom: 2 }),
                children: [
                  this.statusPill = new BeatmapSetOnlineStatusPill().with({
                    animated: false,
                    origin: Anchor.BottomLeft,
                    anchor: Anchor.BottomLeft,
                    textSize: OsuFont.Style.Caption2.size,
                    margin: MarginPadding.of({ right: 4 }),
                  }),
                  this.keyCountText = new OsuSpriteText().with({
                    font: withFont(OsuFont.Style.Body, { weight: FontWeight.SemiBold }),
                    anchor: Anchor.BottomLeft,
                    origin: Anchor.BottomLeft,
                    alpha: 0,
                  }),
                  this.difficultyText = new OsuSpriteText().with({
                    font: withFont(OsuFont.Style.Body, { weight: FontWeight.SemiBold }),
                    anchor: Anchor.BottomLeft,
                    origin: Anchor.BottomLeft,
                    margin: MarginPadding.of({ right: 3 }),
                  }),
                  this.authorText = new OsuSpriteText().with({
                    colour: this.colourProvider.content2,
                    font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.SemiBold }),
                    anchor: Anchor.BottomLeft,
                    origin: Anchor.BottomLeft,
                  }),
                ],
              }),
              new FillFlowContainer().with({
                direction: FillDirection.Horizontal,
                spacing: new Vector2(3),
                autoSizeAxes: Axes.Both,
                children: [
                  this.starRatingDisplay = new StarRatingDisplay({ stars: 0, maxCombo: 0 }, StarRatingDisplaySize.Small, true).with({
                    origin: Anchor.CentreLeft,
                    anchor: Anchor.CentreLeft,
                    scale: new Vector2(0.875),
                  }),
                  this.spreadDisplay = new SpreadDisplay().with({
                    origin: Anchor.CentreLeft,
                    anchor: Anchor.CentreLeft,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];

    this.spreadDisplay.selected.bindTarget = this.selected;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.selected.bindValueChanged(s => {
      this.expanded.value = s.newValue;
    }, true);
  }

  protected override prepareForUse(): void {
    super.prepareForUse();

    const beatmap = this.beatmap;
    const beatmapSet = beatmap.beatmapSet!;

    this.scheduledBackgroundRetrieval = this.scheduler.addDelayed(() => this.beatmapBackground.beatmap = this.beatmaps.getWorkingBeatmap(beatmap), 50);

    this.titleText.text = romanisable(beatmapSet.metadata.titleUnicode, beatmapSet.metadata.title);
    this.artistText.text = romanisable(beatmapSet.metadata.artistUnicode, beatmapSet.metadata.artist);
    this.statusPill.status = beatmap.status;

    this.difficultyIcon.icon = createRulesetIcon(beatmap.ruleset);
    this.difficultyIcon.show();

    this.localRank.beatmap = beatmap;
    this.difficultyText.text = beatmap.difficultyName;
    this.authorText.text = `mapped by ${beatmap.metadata.author.username}`;

    this.computeStarRating();
    this.spreadDisplay.beatmap.value = beatmap;
  }

  protected override freeAfterUse(): void {
    super.freeAfterUse();

    this.scheduledBackgroundRetrieval?.cancel();
    this.scheduledBackgroundRetrieval = null;
    this.beatmapBackground.beatmap = null;
    this.localRank.beatmap = null;
    this.spreadDisplay.beatmap.value = null;
  }

  private computeStarRating(): void {
    if (this.item === null)
      return;

    const starDifficulty = { stars: this.beatmap.starRating, maxCombo: 0 };
    this.starRatingDisplay.current.value = starDifficulty;
    this.spreadDisplay.starDifficulty.value = starDifficulty;
  }

  protected override update(): void {
    super.update();

    // Dirty hack to make sure we don't take up spacing in parent fill flow when not displaying a rank.
    // I can't find a better way to do this.
    this.mainFill.margin = MarginPadding.of({ left: Math.fround(1 / this.starRatingDisplay.scale.x * (this.localRank.hasRank ? 0 : -3)) });

    const diffColour = this.starRatingDisplay.displayedDifficultyColour;

    this.accentColour = diffColour;
    this.spreadDisplay.current.colour = diffColour;

    this.backgroundBorder.colour = diffColour;
    this.difficultyIcon.colour = this.starRatingDisplay.displayedDifficultyTextColour;
  }
}
