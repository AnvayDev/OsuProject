// Ported from osu.Game/Overlays/Toolbar/ToolbarBeatmapListingButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { BeatmapListingOverlay } from '../BeatmapListingOverlay';
import { ToolbarOverlayToggleButton } from './ToolbarOverlayToggleButton';

export class ToolbarBeatmapListingButton extends ToolbarOverlayToggleButton {
  protected override get tooltipAnchor(): Anchor {
    return Anchor.TopRight;
  }

  constructor() {
    super();

    this.hotkey = GlobalAction.ToggleBeatmapListing;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.stateContainer = dependencies.get(BeatmapListingOverlay);

    return r;
  }
}
