// Ported from osu.Game/Overlays/Toolbar/ToolbarRankingsButton.cs
// RankingsOverlay isn't ported yet: its INamedOverlayComponent values are shown (see ToolbarOverlayToggleButton).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { OsuIcon } from '../../graphics/OsuIcon';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarRankingsButton extends ToolbarOverlayToggleButton {
  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.applyNamedOverlayComponent({ icon: OsuIcon.Ranking, title: 'rankings', description: "find out who's the best right now" });

    return r;
  }
}
