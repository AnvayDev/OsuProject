// Ported from osu.Game/Overlays/Toolbar/ToolbarNewsButton.cs
// NewsOverlay isn't ported yet: its INamedOverlayComponent values are shown (see ToolbarOverlayToggleButton).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { OsuIcon } from '../../graphics/OsuIcon';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarNewsButton extends ToolbarOverlayToggleButton {
  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.applyNamedOverlayComponent({ icon: OsuIcon.News, title: 'news', description: 'get up-to-date on community happenings' });

    return r;
  }
}
