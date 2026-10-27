// Ported from osu.Game/Beatmaps/Drawables/Cards/VideoIconPill.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { IconPill } from './IconPill';

export class VideoIconPill extends IconPill {
  constructor() {
    super(FontAwesome.Solid.Film);
  }

  override get tooltipText(): string {
    return 'This beatmap contains video';
  }
}
