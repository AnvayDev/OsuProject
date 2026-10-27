// Ported from osu.Game/Graphics/Containers/ReverseChildIDFillFlowContainer.cs

import type { Drawable } from '@fw/graphics/Drawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';

export class ReverseChildIDFillFlowContainer<T extends Drawable = Drawable> extends FillFlowContainer<T> {
  protected override compare(x: Drawable, y: Drawable): number {
    return this.compareReverseChildID(x, y);
  }
}
