// Ported from osu.Game/Overlays/BeatmapSet/SpotlightBeatmapBadge.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { BeatmapBadge } from './BeatmapBadge';

export class SpotlightBeatmapBadge extends BeatmapBadge {
  constructor() {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.badgeText = 'Spotlight';
    this.badgeColour = dependencies.resolve(OsuColour).spotlightColour;

    // todo: add linking support to allow redirecting spotlight badge to https://osu.ppy.sh/wiki/en/Beatmap_Spotlights.

    return r;
  }
}
