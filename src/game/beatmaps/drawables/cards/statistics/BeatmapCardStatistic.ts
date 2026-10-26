// Ported from osu.Game/Beatmaps/Drawables/Cards/Statistics/BeatmapCardStatistic.cs
// Tooltips (IHasTooltip, IHasCustomTooltip) aren't ported yet: tooltipText is stored only.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuFont, withFont } from '../../../../graphics/OsuFont';
import { OsuSpriteText } from '../../../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../../../overlays/OverlayColourProvider';

/** A single statistic shown on a beatmap card. */
export abstract class BeatmapCardStatistic extends CompositeDrawable {
  protected get icon(): IconUsage {
    return this.spriteIcon.icon;
  }

  protected set icon(value: IconUsage) {
    this.spriteIcon.icon = value;
  }

  protected get text(): string {
    return this.spriteText.text;
  }

  protected set text(value: string) {
    this.spriteText.text = value;
  }

  tooltipText = '';

  private readonly spriteIcon: SpriteIcon;
  private readonly spriteText: OsuSpriteText;

  protected constructor() {
    super();

    this.autoSizeAxes = Axes.Both;

    let spriteIcon!: SpriteIcon;
    let spriteText!: OsuSpriteText;

    this.internalChild = new FillFlowContainer().with({
      autoSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(4, 0),
      children: [
        spriteIcon = new SpriteIcon().with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          size: new Vector2(8),
          margin: MarginPadding.of({ top: 1 }),
        }),
        spriteText = new OsuSpriteText().with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          font: withFont(OsuFont.Default, { size: 11 }),
        }),
      ],
    });

    this.spriteIcon = spriteIcon;
    this.spriteText = spriteText;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.spriteIcon.colour = dependencies.resolve(OverlayColourProvider).content2;

    return r;
  }
}
