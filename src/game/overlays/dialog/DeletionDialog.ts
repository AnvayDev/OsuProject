// Ported from osu.Game/Overlays/Dialog/DeletionDialog.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { DangerousActionDialog } from './DangerousActionDialog';

/** A dialog which provides confirmation for deletion of something. */
export abstract class DeletionDialog extends DangerousActionDialog {
  protected constructor() {
    super();

    this.headerText = 'Are you sure you want to delete the following:';
    this.icon = FontAwesome.Solid.Trash;
  }
}
