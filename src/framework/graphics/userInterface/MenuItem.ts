// Ported from osu.Framework/Graphics/UserInterface/MenuItem.cs and DropdownMenuItem.cs

import { Bindable } from '../../bindables/Bindable';

export class MenuItem {
  /** The text which this MenuItem displays. */
  readonly text = new Bindable<string>('');

  /** The Action performed when this MenuItem is clicked. */
  readonly action = new Bindable<(() => void) | null>(null);

  /** A list of items which are to be displayed in a sub-menu originating from this MenuItem. */
  items: readonly MenuItem[] = [];

  /** Creates a new MenuItem, with an optional action performed when clicked (C#'s MenuItem(text) / MenuItem(text, action)). */
  constructor(text: string, action: (() => void) | null = null) {
    this.text.value = text;
    this.action.value = action;
  }
}

/** (DropdownMenuItem<T>) */
export class DropdownMenuItem<T> extends MenuItem {
  readonly value: T;

  /** (DropdownMenuItem(text, value) / DropdownMenuItem(value, action): the latter's text starts empty.) */
  constructor(text: string, value: T, action: (() => void) | null = null) {
    super(text, action);
    this.value = value;
  }
}
