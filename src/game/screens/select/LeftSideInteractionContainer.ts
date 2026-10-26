// Ported from osu.Game/Screens/Select/LeftSideInteractionContainer.cs

import { Container } from '@fw/graphics/containers/Container';
import type { MouseDownEvent, ScrollEvent } from '@fw/input/events/UIEvents';
import type { InputManager } from '@fw/input/InputManager';

/** Handles mouse interactions required when moving away from the carousel. */
export class LeftSideInteractionContainer extends Container {
  private readonly resetCarouselPosition: (() => void) | null;

  private mouseContained = false;

  private inputManager!: InputManager;

  constructor(resetCarouselPosition: () => void) {
    super();

    this.resetCarouselPosition = resetCarouselPosition;
  }

  // we want to block plain scrolls on the left side so that they don't scroll the carousel,
  // but also we *don't* want to handle scrolls when they're combined with keyboard modifiers
  // as those will usually correspond to other interactions like adjusting volume.
  protected override onScroll(e: ScrollEvent): boolean {
    return !e.controlPressed && !e.altPressed && !e.shiftPressed && !e.superPressed;
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    return true;
  }

  protected override loadComplete(): void {
    this.inputManager = this.getContainingInputManager()!;
    super.loadComplete();
  }

  protected override update(): void {
    super.update();

    // We want to trigger an action whenever the cursor is in the left area of song select.
    // Other elements in song select handle input, so rather than using `onHover` let's check the true mouse position.
    if (this.contains(this.inputManager.currentState.mouse.position)) {
      if (!this.mouseContained) {
        this.mouseContained = true;
        this.resetCarouselPosition?.();
      }
    } else {
      this.mouseContained = false;
    }
  }
}
