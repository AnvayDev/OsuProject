// Ported from osu.Game/Overlays/Toolbar/ToolbarNotificationButton.cs
// NotificationOverlay isn't ported yet: its INamedOverlayComponent values are shown (see ToolbarOverlayToggleButton). Its unread count
// display (CountCircle) is left out until then, as with no notifications it never shows.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { OsuIcon } from '../../graphics/OsuIcon';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarNotificationButton extends ToolbarOverlayToggleButton {
  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  constructor() {
    super();

    this.hotkey = GlobalAction.ToggleNotifications;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.applyNamedOverlayComponent({ icon: OsuIcon.Notification, title: 'notifications', description: "waiting for 'ya" });

    return r;
  }
}
