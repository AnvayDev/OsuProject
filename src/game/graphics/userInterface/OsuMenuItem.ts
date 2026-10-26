// Ported from osu.Game/Graphics/UserInterface/OsuMenuItem.cs

import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import type { Hotkey } from './Hotkey';
import { MenuItemType } from './MenuItemType';

export class OsuMenuItem extends MenuItem {
  readonly type: MenuItemType;

  hotkey: Hotkey | null = null;

  icon: IconUsage | null = null;

  constructor(text: string, type = MenuItemType.Standard, action: (() => void) | null = null) {
    super(text, action);

    this.type = type;
  }
}
