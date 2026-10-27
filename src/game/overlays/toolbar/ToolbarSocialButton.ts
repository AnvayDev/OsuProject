// Ported from osu.Game/Overlays/Toolbar/ToolbarSocialButton.cs
// DashboardOverlay isn't ported yet: its INamedOverlayComponent values are shown (see ToolbarOverlayToggleButton).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { OsuIcon } from '../../graphics/OsuIcon';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarSocialButton extends ToolbarOverlayToggleButton {
  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  constructor() {
    super();

    this.hotkey = GlobalAction.ToggleSocial;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.applyNamedOverlayComponent({ icon: OsuIcon.Global, title: 'dashboard', description: 'view your friends and spectate other players' });

    return r;
  }
}
