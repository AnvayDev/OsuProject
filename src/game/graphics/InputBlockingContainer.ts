// Ported from osu.Game/Graphics/InputBlockingContainer.cs

import { Container } from '@fw/graphics/containers/Container';
import type { ClickEvent, HoverEvent, MouseDownEvent } from '@fw/input/events/UIEvents';

/**
 * A simple container which blocks input events from travelling through it.
 * Note that this will block right clicks as well. Special care needs to be taken to not break context menus from displaying.
 */
export class InputBlockingContainer extends Container {
  protected override onHover(_e: HoverEvent): boolean {
    return true;
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    return true;
  }

  protected override onClick(_e: ClickEvent): boolean {
    return true;
  }
}
