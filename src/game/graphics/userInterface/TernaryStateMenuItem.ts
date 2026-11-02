// Ported from osu.Game/Graphics/UserInterface/TernaryStateMenuItem.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { MenuItemType } from './MenuItemType';
import { StatefulMenuItem } from './StatefulMenuItem';
import { TernaryState } from './TernaryState';

/** An OsuMenuItem with three possible states. */
export abstract class TernaryStateMenuItem extends StatefulMenuItem<TernaryState> {
  /**
   * @param nextStateFunction A function to inform what the next state should be when this item is clicked.
   * @param action A delegate to be invoked when this TernaryStateMenuItem is pressed.
   */
  protected constructor(text: string, nextStateFunction: (state: TernaryState) => TernaryState, type = MenuItemType.Standard,
    action: ((state: TernaryState) => void) | null = null) {
    super(text, TernaryState.False, nextStateFunction, type, action);
  }

  override getIconForState(state: TernaryState): IconUsage | null {
    switch (state) {
      case TernaryState.Indeterminate:
        return FontAwesome.Solid.DotCircle;

      case TernaryState.True:
        return FontAwesome.Solid.Check;
    }

    return null;
  }
}
