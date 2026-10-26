// Ported from osu.Game/Overlays/INamedOverlayComponent.cs

import type { IconUsage } from '@fw/graphics/sprites/IconUsage';

export interface INamedOverlayComponent {
  readonly icon: IconUsage;
  readonly title: string;
  readonly description: string;
}
