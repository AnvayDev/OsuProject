// Ported from osu.Game/Graphics/UserInterface/StatefulMenuItem.cs
// C#'s non-generic StatefulMenuItem (Bindable<object>) and StatefulMenuItem<T> (a Bindable<T> kept in sync with it) are one generic class
// here. TS has no default(T): subclasses pass their state type's default value.

import { Bindable } from '@fw/bindables/Bindable';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { MenuItemType } from './MenuItemType';
import { OsuMenuItem } from './OsuMenuItem';

/** An OsuMenuItem which contains and displays a state. */
export abstract class StatefulMenuItem<T = unknown> extends OsuMenuItem {
  /** The current state that should be displayed. */
  readonly state: Bindable<T>;

  /**
   * @param changeStateFunc A function that mutates a state to another state after this StatefulMenuItem is pressed.
   * @param action A delegate to be invoked when this StatefulMenuItem is pressed.
   */
  protected constructor(text: string, defaultState: T, changeStateFunc: ((state: T) => T) | null, type = MenuItemType.Standard,
    action: ((state: T) => void) | null = null) {
    super(text, type);

    this.state = new Bindable<T>(defaultState);

    this.action.value = () => {
      this.state.value = changeStateFunc?.(this.state.value) ?? this.state.value;
      action?.(this.state.value);
    };
  }

  /** Retrieves the icon to be displayed for a state. */
  abstract getIconForState(state: T): IconUsage | null;
}
