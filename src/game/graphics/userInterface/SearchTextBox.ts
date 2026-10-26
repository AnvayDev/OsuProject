// Ported from osu.Game/Graphics/UserInterface/SearchTextBox.cs

import type { KeyBindingPressEvent } from '@fw/input/bindings/KeyBindings';
import type { KeyDownEvent } from '@fw/input/events/UIEvents';
import { Key } from '@fw/input/Key';
import { PlatformAction } from '@fw/input/PlatformAction';
import { FocusedTextBox } from './FocusedTextBox';

export class SearchTextBox extends FocusedTextBox {
  protected get allowCommit(): boolean {
    return false;
  }

  constructor() {
    super();

    this.height = 35;
    this.placeholderText = 'type to search';
  }

  protected override onPlatformActionPressed(e: KeyBindingPressEvent<PlatformAction>): boolean {
    switch (e.action) {
      case PlatformAction.MoveBackwardLine:
      case PlatformAction.MoveForwardLine:
      // Shift+delete is handled via PlatformAction on macOS. this is not so useful in the context of a SearchTextBox
      // as we do not allow arrow key navigation in the first place (ie. the caret should always be at the end of text)
      // Avoid handling it here to allow other components to potentially consume the shortcut.
      case PlatformAction.DeleteForwardChar:
        return false;
    }

    return super.onPlatformActionPressed(e);
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (!e.controlPressed && !e.shiftPressed) {
      switch (e.key) {
        case Key.Left:
        case Key.Right:
        case Key.Up:
        case Key.Down:
          return false;
      }
    }

    if (!this.allowCommit) {
      switch (e.key) {
        case Key.KeypadEnter:
        case Key.Enter: {
          // even if committing per se is not allowed for this textbox,
          // the commit flow is also responsible for terminating any active IME.
          // ensure that the Enter press terminates IME correctly
          // and is also handled if it needs to be, so that it doesn't leak to some other non-focused drawable and cause breakage.
          const wasImeComposing = this.imeCompositionActive;
          this.finalizeImeComposition(true);
          return wasImeComposing;
        }
      }
    }

    if (e.shiftPressed) {
      switch (e.key) {
        case Key.Delete:
          return false;
      }
    }

    return super.onKeyDown(e);
  }
}
