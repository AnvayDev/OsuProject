// Ported from osu.Game/Overlays/BeatmapListing/BeatmapListingHeader.cs

import type { Drawable } from '@fw/graphics/Drawable';
import { OsuIcon } from '../../graphics/OsuIcon';
import { OverlayHeader } from '../OverlayHeader';
import { OverlayTitle } from '../OverlayTitle';
import { BeatmapListingFilterControl } from './BeatmapListingFilterControl';

export class BeatmapListingHeader extends OverlayHeader {
  /** (declared: assigned by createContent() during the base constructor, which a field initializer would reset) */
  declare filterControl: BeatmapListingFilterControl;

  constructor() {
    super();
  }

  protected override createTitle(): OverlayTitle {
    return new BeatmapListingTitle();
  }

  protected override createContent(): Drawable {
    return this.filterControl = new BeatmapListingFilterControl();
  }
}

/** (BeatmapListingHeader.BeatmapListingTitle) */
class BeatmapListingTitle extends OverlayTitle {
  constructor() {
    super();

    this.title = 'beatmap listing';
    this.description = 'browse for new beatmaps';
    this.icon = OsuIcon.Beatmap;
  }
}
