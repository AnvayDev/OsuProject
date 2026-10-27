// Ported from osu.Game/Beatmaps/Drawables/Cards/HoverHandlingContainer.cs

import { Container } from '@fw/graphics/containers/Container';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';

export class HoverHandlingContainer extends Container {
  hovered: ((e: HoverEvent) => boolean) | null = null;
  unhovered: ((e: HoverLostEvent) => void) | null = null;

  protected override onHover(e: HoverEvent): boolean {
    const handledByBase = super.onHover(e);
    return this.hovered?.(e) ?? handledByBase;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    super.onHoverLost(e);
    this.unhovered?.(e);
  }
}
