// Ported from osu.Framework/Graphics/Cursor/IHasContextMenu.cs
// Duck-typed: a drawable implements it by having a `contextMenuItems` member (see Drawable's HandleInputCache).

import type { Drawable } from '../Drawable';
import type { MenuItem } from '../userInterface/MenuItem';

export interface IHasContextMenu extends Drawable {
  /** Menu items that appear when the drawable is right-clicked. If empty, this drawable will not be right-clickable. */
  readonly contextMenuItems: readonly MenuItem[] | null;
}

export function isHasContextMenu(d: Drawable): d is IHasContextMenu {
  return 'contextMenuItems' in d;
}
