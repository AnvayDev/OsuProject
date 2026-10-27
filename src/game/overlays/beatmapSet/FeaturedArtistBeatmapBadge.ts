// Ported from osu.Game/Overlays/BeatmapSet/FeaturedArtistBeatmapBadge.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { BeatmapBadge } from './BeatmapBadge';

export class FeaturedArtistBeatmapBadge extends BeatmapBadge {
  constructor() {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.badgeText = 'Featured Artist';
    this.badgeColour = dependencies.resolve(OsuColour).featuredArtistColour;

    // todo: add linking support to allow redirecting featured artist badge to corresponding track.

    return r;
  }
}
