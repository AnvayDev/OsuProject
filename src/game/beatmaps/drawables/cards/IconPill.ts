// Ported from osu.Game/Beatmaps/Drawables/Cards/IconPill.cs (tooltips aren't ported yet: tooltipText is informational).

import { Colour4 } from '@fw/graphics/Colour4';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Container } from '@fw/graphics/containers/Container';
import { Box } from '@fw/graphics/shapes/Box';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';

export abstract class IconPill extends CircularContainer {
  get iconSize(): Vector2 {
    return this.iconContainer.size;
  }

  set iconSize(value: Vector2) {
    this.iconContainer.size = value;
  }

  get iconPadding(): MarginPadding {
    return this.iconContainer.padding;
  }

  set iconPadding(value: MarginPadding) {
    this.iconContainer.padding = value;
  }

  private readonly iconContainer: Container;

  protected constructor(icon: IconUsage) {
    super();

    this.autoSizeAxes = Axes.Both;
    this.masking = true;

    let iconContainer!: Container;

    this.children = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: Colour4.Black,
        alpha: 0.5,
      }),
      iconContainer = new Container().with({
        size: new Vector2(22),
        padding: new MarginPadding(5),
        child: new SpriteIcon().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          relativeSizeAxes: Axes.Both,
          icon,
        }),
      }),
    ];

    this.iconContainer = iconContainer;
  }

  abstract get tooltipText(): string;
}
