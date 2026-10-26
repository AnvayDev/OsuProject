// Ported from osu.Game/Overlays/Toolbar/ToolbarChatButton.cs
// ChatOverlay isn't ported yet: its INamedOverlayComponent values are shown (see ToolbarOverlayToggleButton).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { OsuIcon } from '../../graphics/OsuIcon';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarChatButton extends ToolbarOverlayToggleButton {
  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  constructor() {
    super();

    this.hotkey = GlobalAction.ToggleChat;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.applyNamedOverlayComponent({ icon: OsuIcon.Chat, title: 'chat', description: 'join the real-time discussion' });

    return r;
  }
}
