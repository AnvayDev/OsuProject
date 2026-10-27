// Ported from osu.Framework/Graphics/Containers/OverlayContainer.cs

import type { Drawable } from '../Drawable';
import type { HoverEvent, MouseDownEvent, MouseMoveEvent, ScrollEvent } from '../../input/events/UIEvents';
import { isHandleGlobalKeyboardInput } from '../../input/IHandleGlobalKeyboardInput';
import { VisibilityContainer } from './VisibilityContainer';

/** An element which starts hidden and can be toggled to visible. */
export abstract class OverlayContainer extends VisibilityContainer {
  /** Whether we should block any positional input from interacting with things behind us. */
  protected get blockPositionalInput(): boolean {
    return true;
  }

  /**
   * Scroll events are sometimes required to be handled differently to general positional input.
   * This covers whether scroll events that occur within this overlay's bounds are blocked or not.
   * Defaults to the same value as blockPositionalInput.
   */
  protected get blockScrollInput(): boolean {
    return this.blockPositionalInput;
  }

  /** Whether we should block any non-positional input from interacting with things behind us. */
  protected get blockNonPositionalInput(): boolean {
    return false;
  }

  override buildNonPositionalInputQueue(queue: Drawable[], allowBlocking = true): boolean {
    if (this.propagateNonPositionalInputSubTree && this.handleNonPositionalInput && this.blockNonPositionalInput) {
      // when blocking non-positional input behind us, we still want to make sure the global handlers receive events
      // but we don't want other drawables behind us handling them.
      const kept = queue.filter(d => isHandleGlobalKeyboardInput(d));
      queue.length = 0;
      queue.push(...kept);
    }

    return super.buildNonPositionalInputQueue(queue, allowBlocking);
  }

  override get dragBlocksClick(): boolean {
    return false;
  }

  protected override onHover(_e: HoverEvent): boolean {
    return this.blockPositionalInput;
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    return this.blockPositionalInput;
  }

  protected override onMouseMove(_e: MouseMoveEvent): boolean {
    return this.blockPositionalInput;
  }

  protected override onScroll(e: ScrollEvent): boolean {
    return this.blockScrollInput && super.receivePositionalInputAt(e.screenSpaceMousePosition);
  }
}
