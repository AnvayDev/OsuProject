// Ported from osu.Framework/Input/IFocusManager.cs
// TS interfaces don't exist at runtime, so implementers carry the isFocusManager marker (found by Drawable.getContainingFocusManager).

import type { Drawable } from '../graphics/Drawable';

/** An object which can handle Drawable focus. */
export interface IFocusManager {
  readonly isFocusManager: true;

  /** Reset current focused drawable to the top-most drawable which is RequestsFocus. */
  triggerFocusContention(triggerSource: Drawable | null): void;

  /** Changes the currently-focused drawable. Returns true if the potential focus target was valid and is now focused (or null focus was requested). */
  changeFocus(potentialFocusTarget: Drawable | null): boolean;
}

export function isFocusManager(d: unknown): d is IFocusManager {
  return (d as Partial<IFocusManager>)?.isFocusManager === true;
}
