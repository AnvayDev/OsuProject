// Ported from osu.Game/Overlays/IDialogOverlay.cs
// C# marks the interface [Cached]; DI keys are classes here, so OsuGame caches the dialog overlay with `cacheAs(IDialogOverlay, ...)`, and
// implementations are recognised by their isDialogOverlay marker.

import type { PopupDialog } from './dialog/PopupDialog';

/** A global overlay that can show popup dialogs. */
export abstract class IDialogOverlay {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as { isDialogOverlay?: unknown } | null)?.isDialogOverlay === true;
  }

  abstract readonly isDialogOverlay: true;

  /**
   * Push a new dialog for display.
   * This will immediate dismiss any already displayed dialog (cancelling the action).
   * If the dialog instance provided is already displayed, it will be a noop.
   */
  abstract push(dialog: PopupDialog): void;

  /** The currently displayed dialog, if any. */
  abstract get currentDialog(): PopupDialog | null;
}
