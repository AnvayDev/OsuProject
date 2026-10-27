// Ported from osu.Game/Overlays/BeatmapSet/ExplicitContentBeatmapBadge.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { BeatmapBadge } from './BeatmapBadge';

export class ExplicitContentBeatmapBadge extends BeatmapBadge {
  constructor() {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.badgeText = 'Explicit';
    this.badgeColour = dependencies.resolve(OsuColour).orange2;

    return r;
  }
}
