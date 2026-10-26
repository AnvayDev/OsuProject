// BeatmapCard.Create from osu.Game/Beatmaps/Drawables/Cards/BeatmapCard.cs, in its own module: BeatmapCard's subclasses import BeatmapCard,
// so the factory can't live in BeatmapCard.ts without a circular import.

import type { APIBeatmapSet } from '../../../online/api/requests/responses/APIBeatmapSet';
import type { BeatmapCard } from './BeatmapCard';
import { BeatmapCardExtra } from './BeatmapCardExtra';
import { BeatmapCardNormal } from './BeatmapCardNormal';
import { BeatmapCardSize } from './BeatmapCardSize';

export function createBeatmapCard(beatmapSet: APIBeatmapSet, size: BeatmapCardSize, allowExpansion = true): BeatmapCard {
  switch (size) {
    case BeatmapCardSize.Normal:
      return new BeatmapCardNormal(beatmapSet, allowExpansion);

    case BeatmapCardSize.Extra:
      return new BeatmapCardExtra(beatmapSet, allowExpansion);

    default:
      throw new Error(`Unsupported card size: ${size}`);
  }
}
