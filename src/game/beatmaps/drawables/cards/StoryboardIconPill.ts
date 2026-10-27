// Ported from osu.Game/Beatmaps/Drawables/Cards/StoryboardIconPill.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { IconPill } from './IconPill';

export class StoryboardIconPill extends IconPill {
  constructor() {
    super(FontAwesome.Solid.Image);
  }

  override get tooltipText(): string {
    return 'This beatmap contains storyboard';
  }
}
