// Ported from osu.Game/Overlays/Toolbar/ToolbarSettingsButton.cs
// SettingsOverlay isn't ported yet: its INamedOverlayComponent values are shown (see ToolbarOverlayToggleButton).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { OsuIcon } from '../../graphics/OsuIcon';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarSettingsButton extends ToolbarOverlayToggleButton {
  constructor() {
    super();

    this.buttonContent.width *= Math.fround(1.4);
    this.hotkey = GlobalAction.ToggleSettings;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.applyNamedOverlayComponent({ icon: OsuIcon.Settings, title: 'settings', description: 'change the way osu! behaves' });

    return r;
  }
}
