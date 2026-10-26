// Ported from osu.Framework/Graphics/Containers/FocusedOverlayContainer.cs

import type { ValueChangedEvent } from '../../bindables/Bindable';
import { OverlayContainer } from './OverlayContainer';
import { Visibility } from './VisibilityContainer';

/** An overlay container that eagerly holds keyboard focus. */
export abstract class FocusedOverlayContainer extends OverlayContainer {
  override get requestsFocus(): boolean {
    return this.state.value === Visibility.Visible;
  }

  override get acceptsFocus(): boolean {
    return this.state.value === Visibility.Visible;
  }

  protected override updateState(state: ValueChangedEvent<Visibility>): void {
    super.updateState(state);

    switch (state.newValue) {
      case Visibility.Hidden:
        if (this.hasFocus)
          this.getContainingFocusManager()?.changeFocus(null);
        break;

      case Visibility.Visible:
        this.schedule(() => this.getContainingFocusManager()?.triggerFocusContention(this));
        break;
    }
  }
}
