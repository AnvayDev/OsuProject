// Ported from osu.Game/Screens/Menu/FlowContainerWithOrigin.cs

import type { Drawable } from '@fw/graphics/Drawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Anchor } from '@fw/layout/Enums';
import type { Vector2 } from '@fw/layout/Vector2';

/** A flow container with an origin based on one of its contained drawables. */
export class FlowContainerWithOrigin extends FillFlowContainer {
  /**
   * A target drawable which this flowcontainer should be centered around.
   * This target should be a direct child of this FlowContainer.
   */
  centreTarget: Drawable | null = null;

  protected override compare(x: Drawable, y: Drawable): number {
    return this.compareReverseChildID(x, y);
  }

  override get origin(): Anchor {
    return Anchor.Custom;
  }

  override set origin(value: Anchor) {
    super.origin = value;
  }

  override get originPosition(): Vector2 {
    if (this.centreTarget === null)
      return super.originPosition;

    return this.centreTarget.drawPosition.add(this.centreTarget.drawSize.div(2).mul(this.centreTarget.scale));
  }

  override set originPosition(value: Vector2) {
    super.originPosition = value;
  }
}
