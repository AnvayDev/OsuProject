// Ported from osu.Game/Overlays/Dialog/PopupDialogButton.cs

import { DialogButton } from '../../graphics/userInterface/DialogButton';
import { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';

export class PopupDialogButton extends DialogButton {
  /** Whether the dialog should be closed when any action is invoked. True by default. */
  hideDialogOnAction = true;

  constructor(sampleSet = HoverSampleSet.Button) {
    super(sampleSet);

    this.height = 50;
    this.textSize = 18;
  }
}
