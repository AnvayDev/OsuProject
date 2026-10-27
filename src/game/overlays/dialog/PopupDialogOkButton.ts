// Ported from osu.Game/Overlays/Dialog/PopupDialogOkButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';
import { OsuColour } from '../../graphics/OsuColour';
import { PopupDialogButton } from './PopupDialogButton';

export class PopupDialogOkButton extends PopupDialogButton {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.buttonColour = dependencies.resolve(OsuColour).pink;
    return r;
  }

  constructor() {
    super(HoverSampleSet.DialogOk);
  }
}
