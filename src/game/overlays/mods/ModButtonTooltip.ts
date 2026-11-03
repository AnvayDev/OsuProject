// Ported from osu.Game/Overlays/Mods/ModButtonTooltip.cs

import type { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import type { ITooltip } from '@fw/graphics/cursor/ITooltip';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import type { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { FontWeight, OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import type { Mod } from '../../rulesets/mods/Mod';
import type { OverlayColourProvider } from '../OverlayColourProvider';

export class ModButtonTooltip extends VisibilityContainer implements ITooltip {
  private readonly descriptionText: OsuSpriteText;

  private readonly tooltipContent: FillFlowContainer;

  protected override get content(): Container<Drawable> {
    return this.tooltipContent;
  }

  constructor(colourProvider: OverlayColourProvider) {
    super();

    this.autoSizeAxes = Axes.Both;
    this.masking = true;
    this.cornerRadius = 5;

    let descriptionText!: OsuSpriteText;

    this.internalChildren = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: colourProvider.background6,
      }),
      this.tooltipContent = new FillFlowContainer().with({
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Vertical,
        padding: MarginPadding.of({ left: 10, right: 10, top: 5, bottom: 5 }),
        children: [
          descriptionText = new OsuSpriteText().with({
            colour: colourProvider.content1,
            font: OsuFont.getFont({ weight: FontWeight.Regular }),
          }),
        ],
      }),
    ];

    this.descriptionText = descriptionText;
  }

  protected override popIn(): void {
    this.fadeIn(200, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.fadeOut(200, Easing.OutQuint);
  }

  private lastMod: Mod | null = null;

  setContent(content: unknown): void {
    const mod = content as Mod;

    if (mod.equals(this.lastMod))
      return;

    this.lastMod = mod;

    this.updateDisplay(mod);
  }

  protected updateDisplay(mod: Mod): void {
    this.descriptionText.text = mod.description;
  }

  move(pos: Vector2): void {
    this.position = pos;
  }
}
