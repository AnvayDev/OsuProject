// Ported from osu.Game/Overlays/BeatmapSet/BeatmapBadge.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../OverlayColourProvider';

export abstract class BeatmapBadge extends CompositeDrawable {
  set badgeText(value: string) {
    this.badgeLabel.text = value.toUpperCase();
  }

  set badgeColour(value: Colour4) {
    this.badgeLabel.colour = value;
  }

  private readonly background: Box;
  private readonly badgeLabel: OsuSpriteText;

  protected constructor() {
    super();

    this.autoSizeAxes = Axes.Both;

    let background!: Box;
    let badgeLabel!: OsuSpriteText;

    this.internalChild = new CircularContainer().with({
      masking: true,
      autoSizeAxes: Axes.Both,
      children: [
        background = new Box().with({
          relativeSizeAxes: Axes.Both,
        }),
        badgeLabel = new OsuSpriteText().with({
          font: OsuFont.getFont({ size: 10, weight: FontWeight.SemiBold }),
          margin: MarginPadding.of({ horizontal: 10, vertical: 2 }),
        }),
      ],
    });

    this.background = background;
    this.badgeLabel = badgeLabel;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.background.colour = dependencies.get(OverlayColourProvider)?.background5 ?? dependencies.resolve(OsuColour).gray2;

    return r;
  }
}
