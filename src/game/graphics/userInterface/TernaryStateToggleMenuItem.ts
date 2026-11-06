// Ported from osu.Game/Graphics/UserInterface/TernaryStateToggleMenuItem.cs

import { MenuItemType } from './MenuItemType';
import { TernaryState } from './TernaryState';
import { TernaryStateMenuItem } from './TernaryStateMenuItem';

/** A ternary state menu item which toggles the state of this item false if clicked when true. */
export class TernaryStateToggleMenuItem extends TernaryStateMenuItem {
  /** @param action A delegate to be invoked when this TernaryStateMenuItem is pressed. */
  constructor(text: string, type = MenuItemType.Standard, action: ((state: TernaryState) => void) | null = null) {
    super(text, getNextState, type, action);
  }
}

function getNextState(state: TernaryState): TernaryState {
  switch (state) {
    case TernaryState.False:
      return TernaryState.True;

    case TernaryState.Indeterminate:
      return TernaryState.True;

    case TernaryState.True:
      return TernaryState.False;
  }
}
