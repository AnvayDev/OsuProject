// Ported from osu.Framework/Graphics/UserInterface/IDropdown.cs
// DI keys are classes here, so the interface is an abstract class Dropdown is cached as; instanceof recognises it by its isDropdown marker.

import type { Bindable } from '../../bindables/Bindable';
import type { Signal } from '../../bindables/Signal';
import type { Drawable } from '../Drawable';
import type { MenuState } from './Menu';

export abstract class IDropdown {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as { isDropdown?: unknown } | null)?.isDropdown === true;
  }

  abstract readonly isDropdown: true;

  /** Invoked when the menu state of this dropdown changes. */
  abstract readonly menuStateChanged: Signal<MenuState>;

  /** Whether this dropdown is enabled (C#'s IBindable<bool> Enabled). */
  abstract readonly enabled: Bindable<boolean>;

  /** The current menu state of this dropdown. */
  abstract readonly menuState: MenuState;

  /** Toggles the menu of this dropdown. */
  abstract toggleMenu(): void;

  /** Opens the menu of this dropdown. */
  abstract openMenu(): void;

  /** Closes the menu of this dropdown. */
  abstract closeMenu(): void;

  /** Commits the current pre-selected item in the menu. */
  abstract commitPreselection(): void;

  // (IDropdown.TriggerFocusContention / ChangeFocus: renamed, as Dropdown's IFocusManager members of the same names isolate focus instead.)

  /** Triggers focus contention within this dropdown's focus manager. */
  abstract dropdownTriggerFocusContention(triggerSource: Drawable | null): void;

  /** Changes the focus within this dropdown's focus manager. */
  abstract dropdownChangeFocus(potentialFocusTarget: Drawable | null): boolean;
}
