// Ported from osu.Game/Screens/Select/PanelGroup.cs
// Context menus aren't ported.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { TrianglesV2 } from '../../graphics/backgrounds/TrianglesV2';
import { CarouselItem } from '../../graphics/carousel/CarouselItem';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import type { GroupDefinition } from './GroupDefinition';
import { Panel } from './Panel';

export class PanelGroup extends Panel {
  static readonly HEIGHT = Math.fround(CarouselItem.DEFAULT_HEIGHT * Math.fround(1.2));

  // (C#'s iconContainer; TS private names may not repeat the base Panel's.)
  private groupIconContainer!: Drawable;
  private titleText!: OsuSpriteText;
  private triangles!: TrianglesV2;
  private countPill!: CircularContainer;
  private countText!: OsuSpriteText;
  private glow!: Box;

  private colourProvider!: OverlayColourProvider;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

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
        colour: colourProvider.background3,
      }),
    });

    this.background = new Box().with({
      relativeSizeAxes: Axes.Both,
      colour: colourProvider.highlight1,
    });

    this.accentColour = colourProvider.highlight1;
    this.content.children = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: colourProvider.background5,
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
      this.titleText = new OsuSpriteText().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        font: OsuFont.Style.Heading2,
        useFullGlyphHeight: false,
        x: 10,
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

  private onExpanded(): void {
    const duration = 500;

    this.groupIconContainer.resizeWidthTo(this.expanded.value ? 20 : 5, duration, Easing.OutQuint);
    this.groupIconContainer.fadeTo(this.expanded.value ? 1 : 0, duration, Easing.OutQuint);

    const colour = this.expanded.value
      ? ColourInfo.gradientHorizontal(this.colourProvider.highlight1.opacity(0.25), this.colourProvider.highlight1.opacity(0))
      : ColourInfo.gradientHorizontal(this.colourProvider.background6, this.colourProvider.background5);

    this.triangles.fadeColour(colour, duration, Easing.OutQuint);
    this.glow.fadeTo(this.expanded.value ? 0.4 : 0, duration, Easing.OutQuint);
  }

  protected override prepareForUse(): void {
    super.prepareForUse();

    const group = this.item!.model as GroupDefinition;

    this.titleText.text = group.title;
    // (ToString("N0"): grouped thousands)
    this.countText.text = this.item!.nestedItemCount.toLocaleString('en-US');
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // Move the count pill in the opposite direction to keep it pinned to the screen regardless of the X position of TopLevelContent.
    this.countPill.x = -this.topLevelContent.x;
  }
}
