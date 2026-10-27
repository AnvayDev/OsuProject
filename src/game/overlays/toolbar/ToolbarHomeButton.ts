// Ported from osu.Game/Overlays/Toolbar/ToolbarHomeButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { OsuIcon } from '../../graphics/OsuIcon';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { ToolbarButton } from './ToolbarButton';

export class ToolbarHomeButton extends ToolbarButton {
  constructor() {
    super();

    this.buttonContent.width *= Math.fround(1.4);
    this.hotkey = GlobalAction.Home;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.tooltipMain = 'home';
    this.tooltipSub = 'return to the main menu';
    this.setIcon(OsuIcon.Home);

    return r;
  }
}
