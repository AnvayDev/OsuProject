// Ported from osu.Game/Overlays/Dialog/DangerousActionDialog.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { PopupDialog } from './PopupDialog';
import { PopupDialogCancelButton } from './PopupDialogCancelButton';
import { PopupDialogDangerousButton } from './PopupDialogDangerousButton';

/**
 * A dialog which provides confirmation for actions which result in permanent consequences.
 * Differs from ConfirmDialog in that the confirmation button is a "dangerous" one (requires the confirm button to be held).
 * The default implementation comes with text for a generic deletion operation. This can be further customised by specifying custom headerText.
 */
export abstract class DangerousActionDialog extends PopupDialog {
  /** The action which performs the deletion. */
  protected dangerousAction: (() => void) | null = null;

  /** The action to perform if cancelled. */
  protected cancelAction: (() => void) | null = null;

  protected constructor() {
    super();

    this.headerText = 'Caution';

    this.icon = FontAwesome.Solid.ExclamationTriangle;

    this.buttons = [
      new PopupDialogDangerousButton().with({
        text: 'Yes. Go for it.',
        action: () => this.dangerousAction?.(),
      }),
      new PopupDialogCancelButton().with({
        text: 'No! Abort mission',
        action: () => this.cancelAction?.(),
      }),
    ];
  }
}
