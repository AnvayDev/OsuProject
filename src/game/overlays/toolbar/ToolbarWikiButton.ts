// Ported from osu.Game/Overlays/Toolbar/ToolbarWikiButton.cs
// WikiOverlay isn't ported yet: its INamedOverlayComponent values are shown (see ToolbarOverlayToggleButton).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { OsuIcon } from '../../graphics/OsuIcon';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarWikiButton extends ToolbarOverlayToggleButton {
  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.applyNamedOverlayComponent({ icon: OsuIcon.Wiki, title: 'wiki', description: 'knowledge base' });

    return r;
  }
}
