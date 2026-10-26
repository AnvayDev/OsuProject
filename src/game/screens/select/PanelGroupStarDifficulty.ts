// Ported from osu.Game/Screens/Select/PanelGroupStarDifficulty.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import type { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { TrianglesV2 } from '../../graphics/backgrounds/TrianglesV2';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { StarDifficultyGroupDefinition } from './GroupDefinition';
import { MenuItemType } from '../../graphics/userInterface/MenuItemType';
import { OsuMenuItem } from '../../graphics/userInterface/OsuMenuItem';
import { Panel } from './Panel';
import { PanelGroup } from './PanelGroup';

export class PanelGroupStarDifficulty extends Panel {
  static readonly HEIGHT = PanelGroup.HEIGHT;

  private colours!: OsuColour;

  private colourProvider!: OverlayColourProvider;

  // (C#'s iconContainer; TS private names may not repeat the base Panel's.)
  private groupIconContainer!: Drawable;
  private backgroundBorder!: Box;
  private contentBackground!: Box;
  private starRatingText!: OsuSpriteText;
  private countPill!: CircularContainer;
  private countText!: OsuSpriteText;
  private triangles!: TrianglesV2;
  private glow!: Box;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);
    const colourProvider = this.colourProvider = dependencies.resolve(OverlayColourProvider);

    this.height = PanelGroup.HEIGHT;

    this.icon = this.groupIconContainer = new Container().with({
      alwaysPresent: true,
      relativeSizeAxes: Axes.Y,
      alpha: 0,
      child: new SpriteIcon().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        icon: FontAwesome.Solid.ChevronDown,
        size: new Vector2(12),
      }),
    });

    this.background = this.backgroundBorder = new Box().with({
      relativeSizeAxes: Axes.Both,
      colour: colourProvider.highlight1,
    });

    this.accentColour = colourProvider.highlight1;
    this.content.children = [
      this.contentBackground = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      this.triangles = new TrianglesV2().with({
        relativeSizeAxes: Axes.Both,
        thickness: Math.fround(0.02),
        spawnRatio: 0.6,
        colour: ColourInfo.gradientHorizontal(colourProvider.background6, colourProvider.background5),
      }),
      this.glow = new Box().with({
        relativeSizeAxes: Axes.Both,
        width: 0.5,
        colour: ColourInfo.gradientHorizontal(colourProvider.highlight1, colourProvider.highlight1.opacity(0)),
      }),
      new FillFlowContainer().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        autoSizeAxes: Axes.Both,
        spacing: new Vector2(10, 0),
        margin: MarginPadding.of({ left: 10 }),
        children: [
          this.starRatingText = new OsuSpriteText().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            useFullGlyphHeight: false,
            font: OsuFont.Style.Heading2,
          }),
        ],
      }),
      this.countPill = new CircularContainer().with({
        anchor: Anchor.CentreRight,
        origin: Anchor.CentreRight,
        size: new Vector2(50, 14),
        margin: MarginPadding.of({ right: 30 }),
        masking: true,
        children: [
          new Box().with({
            relativeSizeAxes: Axes.Both,
            colour: Colour4.Black.opacity(0.7),
          }),
          this.countText = new OsuSpriteText().with({
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.Bold }),
            useFullGlyphHeight: false,
          }),
        ],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.expanded.bindValueChanged(() => this.onExpanded(), true);
  }

  private ratingColour = Colour4.White;

  protected override prepareForUse(): void {
    super.prepareForUse();

    const group = this.item!.model as StarDifficultyGroupDefinition;
    const starNumber = Math.trunc(group.difficulty.stars);

    this.ratingColour = starNumber >= 9 ? OsuColour.gray(0.2) : this.colours.forStarDifficulty(starNumber);

    this.accentColour = this.ratingColour;
    this.backgroundBorder.colour = this.ratingColour;
    this.contentBackground.colour = this.ratingColour.darken(1);
    this.glow.colour = ColourInfo.gradientHorizontal(this.ratingColour, this.ratingColour.opacity(0));
    this.groupIconContainer.colour = starNumber >= 7 ? this.colourProvider.content1 : this.colourProvider.background5;
    this.starRatingText.colour = this.colourProvider.content1;
    this.starRatingText.text = group.title;

    let colour: ColourInfo;

    if (starNumber >= 8)
      colour = ColourInfo.gradientHorizontal(this.ratingColour, this.ratingColour.darken(0.2));
    else
      colour = ColourInfo.gradientHorizontal(this.ratingColour.darken(0.6), this.ratingColour.darken(0.8));

    this.triangles.colour = colour;

    // (ToLocalisableString("N0"): grouped thousands)
    this.countText.text = this.item!.nestedItemCount.toLocaleString('en-US');

    this.onExpanded();
  }

  private onExpanded(): void {
    const duration = 500;

    this.groupIconContainer.resizeWidthTo(this.expanded.value ? 20 : 5, duration, Easing.OutQuint);
    this.groupIconContainer.fadeTo(this.expanded.value ? 1 : 0, duration, Easing.OutQuint);

    this.glow.fadeTo(this.expanded.value ? 0.4 : 0, duration, Easing.OutQuint);
  }

  protected override update(): void {
    super.update();

    // Move the count pill in the opposite direction to keep it pinned to the screen regardless of the X position of TopLevelContent.
    this.countPill.x = -this.topLevelContent.x;
  }

  override get contextMenuItems(): readonly MenuItem[] {
    if (this.item === null)
      return [];

    return [
      new OsuMenuItem(this.expanded.value ? 'Collapse' : 'Expand', MenuItemType.Highlighted, () => this.triggerClick()),
    ];
  }
}
