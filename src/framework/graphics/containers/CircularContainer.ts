// Ported from osu.Framework/Graphics/Containers/CircularContainer.cs
// C# sets CornerRadius in GenerateDrawNodeSubtree; the DOM equivalent is validateElementSubTree (called only for drawn composites,
// right before their element state is applied).

import { Container } from './Container';

/** A container which is rounded (via automatic corner-radius and corner-exponent=2) on the shortest edge. */
export class CircularContainer extends Container {
  /** @internal */
  override validateElementSubTree(): void {
    // this shouldn't have to be done here, but it's the only place it works correctly.
    // see https://github.com/ppy/osu-framework/pull/1666
    this.cornerRadius = Math.min(this.drawSize.x, this.drawSize.y) / 2;

    super.validateElementSubTree();
  }
}
