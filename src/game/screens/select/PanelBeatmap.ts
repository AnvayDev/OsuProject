// Ported from osu.Game/Screens/Select/PanelBeatmap.cs
// Context menus aren't ported. The difficulty cache isn't ported (no difficulty calculators): the star difficulty is the value C#'s
// GetBindableDifficulty starts with, StarDifficulty(beatmap.StarRating, 0). Ruleset variants (the mania key count) need ruleset instances,
// which aren't ported, so the variant text stays hidden as for the single-variant osu! ruleset.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import { StarRatingDisplay, StarRatingDisplaySize } from '../../beatmaps/drawables/StarRatingDisplay';
import { TrianglesV2 } from '../../graphics/backgrounds/TrianglesV2';
import { CarouselItem } from '../../graphics/carousel/CarouselItem';
import { ConstrainedIconContainer } from '../../graphics/containers/ConstrainedIconContainer';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { StarCounter } from '../../graphics/userInterface/StarCounter';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { GroupedBeatmap } from './GroupDefinition';
import { Panel } from './Panel';
import { createRulesetIcon } from './PanelBeatmapSet.SpreadDisplay';
import { PanelLocalRankDisplay } from './PanelLocalRankDisplay';

export class PanelBeatmap extends Panel {
  static readonly HEIGHT = CarouselItem.DEFAULT_HEIGHT;

  private starCounter!: StarCounter;
  private difficultyIcon!: ConstrainedIconContainer;
  private variantText!: OsuSpriteText;
  private starRatingDisplay!: StarRatingDisplay;
  private localRank!: PanelLocalRankDisplay;
  private difficultyText!: OsuSpriteText;
  private authorText!: OsuSpriteText;
  private mainFill!: FillFlowContainer;

  private backgroundBorder!: Box;
  private backgroundDifficultyTint!: Box;

  private triangles!: TrianglesV2;

  private get beatmap(): BeatmapInfo {
    return (this.item!.model as GroupedBeatmap).beatmap;
  }

  protected override get isBeatmapPanel(): boolean {
    return true;
  }

  constructor() {
    super();

    this.panelXOffset = 60;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.height = PanelBeatmap.HEIGHT;

    this.icon = this.difficultyIcon = new ConstrainedIconContainer().with({
      size: new Vector2(9),
      margin: MarginPadding.of({ left: 2.5, right: 1.5 }),
      colour: colourProvider.background5,
    });

    this.background = this.backgroundBorder = new Box().with({
      relativeSizeAxes: Axes.Both,
    });

    this.content.children = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: ColourInfo.gradientHorizontal(colourProvider.background3, colourProvider.background4),
      }),
      this.backgroundDifficultyTint = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      this.triangles = new TrianglesV2().with({
        scaleAdjust: 1.2,
        thickness: Math.fround(0.01),
        velocity: 0.3,
        relativeSizeAxes: Axes.Both,
      }),
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
            autoSizeAxes: Axes.Both,
            padding: MarginPadding.of({ bottom: 3.5 }),
            children: [
              new FillFlowContainer().with({
                direction: FillDirection.Horizontal,
                autoSizeAxes: Axes.Both,
                padding: MarginPadding.of({ bottom: 4 }),
                children: [
                  this.variantText = new OsuSpriteText().with({
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
                    colour: colourProvider.content2,
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
                  this.starCounter = new StarCounter().with({
                    anchor: Anchor.CentreLeft,
                    origin: Anchor.CentreLeft,
                    scale: new Vector2(0.4),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];

    return r;
  }

  protected override prepareForUse(): void {
    super.prepareForUse();

    this.difficultyIcon.icon = createRulesetIcon(this.beatmap.ruleset);

    this.localRank.beatmap = this.beatmap;
    this.difficultyText.text = this.beatmap.difficultyName;
    this.authorText.text = `mapped by ${this.beatmap.metadata.author.username}`;

    this.computeStarRating();
  }

  protected override freeAfterUse(): void {
    super.freeAfterUse();

    this.localRank.beatmap = null;
  }

  private computeStarRating(): void {
    if (this.item === null)
      return;

    const starDifficulty = { stars: this.beatmap.starRating, maxCombo: 0 };
    this.starRatingDisplay.current.value = starDifficulty;
    this.starCounter.current = starDifficulty.stars;
  }

  protected override update(): void {
    super.update();

    // Dirty hack to make sure we don't take up spacing in parent fill flow when not displaying a rank.
    // I can't find a better way to do this.
    this.mainFill.margin = MarginPadding.of({ left: Math.fround(1 / this.starRatingDisplay.scale.x * (this.localRank.hasRank ? 0 : -3)) });

    const diffColour = this.starRatingDisplay.displayedDifficultyColour;

    if (this.accentColour === null || !this.accentColour.equals(diffColour)) {
      this.accentColour = diffColour;
      this.starCounter.colour = diffColour;

      this.backgroundBorder.colour = diffColour;
      this.backgroundDifficultyTint.colour = ColourInfo.gradientHorizontal(diffColour.opacity(0.25), diffColour.opacity(0));

      this.triangles.colour = ColourInfo.gradientVertical(diffColour.opacity(0.25), diffColour.opacity(0));
    }

    if (!this.difficultyIcon.colour.equals(this.starRatingDisplay.displayedDifficultyTextColour))
      this.difficultyIcon.colour = this.starRatingDisplay.displayedDifficultyTextColour;
  }
}
