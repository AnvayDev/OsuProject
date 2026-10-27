// Ported from osu.Game/Graphics/Containers/ConstrainedIconContainer.cs

import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { Drawable } from '@fw/graphics/Drawable';
import { Anchor } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';

/** Display an icon that is forced to scale to the size of this container. */
export class ConstrainedIconContainer extends CompositeDrawable {
  get icon(): Drawable {
    return this.internalChild;
  }

  set icon(value: Drawable) {
    this.internalChild = value;
  }

  protected override update(): void {
    super.update();

    if (this.internalChildren.length > 0 && this.internalChild.drawSize.x > 0) {
      // We're modifying scale here for a few reasons
      // - Guarantees correctness if BorderWidth is being used
      // - If we were to use RelativeSize/FillMode, we'd need to set the Icon's RelativeSizeAxes directly.
      //   We can't do this because we would need access to AutoSizeAxes to set it to none.
      //   Other issues come up along the way too, so it's not a good solution.
      const fitScale = Math.min(this.drawSize.x / this.internalChild.drawSize.x, this.drawSize.y / this.internalChild.drawSize.y);
      this.internalChild.scale = new Vector2(fitScale);
      this.internalChild.anchor = Anchor.Centre;
      this.internalChild.origin = Anchor.Centre;
    }
  }
}
