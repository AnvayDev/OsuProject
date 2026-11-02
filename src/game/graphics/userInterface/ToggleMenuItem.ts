// Ported from osu.Game/Graphics/UserInterface/ToggleMenuItem.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { MenuItemType } from './MenuItemType';
import { StatefulMenuItem } from './StatefulMenuItem';

/** An OsuMenuItem which displays an enabled or disabled state. */
export class ToggleMenuItem extends StatefulMenuItem<boolean> {
  /** @param action A delegate to be invoked when this ToggleMenuItem is pressed. */
  constructor(text: string, type = MenuItemType.Standard, action: ((state: boolean) => void) | null = null) {
    super(text, false, value => !value, type, action);
  }

  override getIconForState(state: boolean): IconUsage | null {
    return state ? FontAwesome.Solid.Check : null;
  }
}
