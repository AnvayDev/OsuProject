// Ported from osu.Framework/Graphics/Containers/BasicScrollContainer.cs

import { Axes, Direction } from '../../layout/Enums';
import { Vector2 } from '../../layout/Vector2';
import { Easing } from '../../transforms/Easing';
import type { Drawable } from '../Drawable';
import { FrameworkColour } from '../FrameworkColour';
import { Box } from '../shapes/Box';
import { ScrollContainer, ScrollbarContainer } from './ScrollContainer';

export class BasicScrollContainer<T extends Drawable = Drawable> extends ScrollContainer<T> {
  constructor(scrollDirection = Direction.Vertical) {
    super(scrollDirection);
  }

  protected override createScrollbar(direction: Direction): ScrollbarContainer {
    return new BasicScrollbar(direction);
  }
}

const dim_size = 8;

export class BasicScrollbar extends ScrollbarContainer {
  constructor(direction: Direction) {
    super(direction);

    this.child = new Box().with({
      relativeSizeAxes: Axes.Both,
      colour: FrameworkColour.YellowGreen,
    });
  }

  protected override resizeScrollbarTo(val: number, duration = 0, easing = Easing.None): void {
    const size = this.scrollDirection === Direction.Horizontal ? new Vector2(val, dim_size) : new Vector2(dim_size, val);
    this.resizeTo(size, duration, easing);
  }
}
