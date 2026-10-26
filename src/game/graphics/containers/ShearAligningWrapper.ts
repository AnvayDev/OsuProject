// Ported from osu.Game/Graphics/Containers/ShearAligningWrapper.cs

import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { Drawable } from '@fw/graphics/Drawable';
import { Axes, Invalidation } from '@fw/layout/Enums';
import { LayoutValue } from '@fw/layout/Layout';
import { MarginPadding } from '@fw/layout/MarginPadding';
import type { RectangleF } from '@fw/layout/Primitives';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuGame } from '../../OsuGame';

/**
 * Adds left padding based on direct parent to make sheared pieces in a vertical flow aligned appropriately.
 * See associated test scene for further demonstration.
 */
export class ShearAligningWrapper extends CompositeDrawable {
  private readonly layout = new LayoutValue(Invalidation.MiscGeometry);

  // Sheared components regularly end up off the side of the screen due to padding considerations.
  // If we use this class in places where performance is important, we should reconsider the handling of this.
  protected override computeIsMaskedAway(_maskingBounds: RectangleF): boolean {
    return false;
  }

  constructor(drawable: Drawable) {
    super();

    this.relativeSizeAxes = drawable.relativeSizeAxes;
    this.autoSizeAxes = Axes.Both & ~drawable.relativeSizeAxes;

    this.internalChild = drawable;

    this.addLayout(this.layout);
  }

  protected override update(): void {
    super.update();

    if (!this.layout.isValid) {
      this.updateLayout();
      this.layout.validate();
    }
  }

  private updateLayout(): void {
    const parent = this.parent!;
    const shearWidth = Math.fround(OsuGame.SHEAR.x * parent.drawHeight);
    const relativeY = parent.drawHeight === 0 ? 0 : Math.fround(this.internalChild.toSpaceOfOtherDrawable(Vector2.Zero, parent).y / parent.drawHeight);
    this.padding = MarginPadding.of({ left: Math.fround(shearWidth * relativeY) });
  }
}
