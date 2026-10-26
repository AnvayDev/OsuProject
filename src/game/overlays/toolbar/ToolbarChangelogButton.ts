// Ported from osu.Game/Overlays/Toolbar/ToolbarChangelogButton.cs
// ChangelogOverlay isn't ported yet: its INamedOverlayComponent values are shown (see ToolbarOverlayToggleButton).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { OsuIcon } from '../../graphics/OsuIcon';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarChangelogButton extends ToolbarOverlayToggleButton {
  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.applyNamedOverlayComponent({ icon: OsuIcon.ChangelogB, title: 'changelog', description: 'track recent dev updates in the osu! ecosystem' });

    return r;
  }
}
