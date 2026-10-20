// Ported from osu.Framework/Graphics/Containers/FillFlowContainer.cs

import { Anchor, Axes, FillDirection, FillMode } from '../../layout/Enums';
import { FLOAT_MAX, Precision } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import type { Drawable } from '../Drawable';
import { FlowContainer } from './FlowContainer';

/** A FlowContainer that fills space by arranging its children next to each other. Children are arranged in the order of their layout positions. */
export class FillFlowContainer<T extends Drawable = Drawable> extends FlowContainer<T> {
  private _direction = FillDirection.Full;

  /** If Full, the children are filled horizontally first, and then vertically as rows. */
  get direction(): FillDirection {
    return this._direction;
  }

  set direction(value: FillDirection) {
    if (this._direction === value)
      return;

    this._direction = value;
    this.invalidateLayout();
  }

  private _spacing = Vector2.Zero;

  /** The spacing between individual elements. Default is Vector2.Zero. */
  get spacing(): Vector2 {
    return this._spacing;
  }

  set spacing(value: Vector2) {
    if (this._spacing.equals(value))
      return;

    this._spacing = value;
    this.invalidateLayout();
  }

  private spacingFactor(c: Drawable): Vector2 {
    let { x, y } = c.relativeOriginPosition;

    if ((c.anchor & Anchor.x2) !== 0)
      x = 1 - x;
    if ((c.anchor & Anchor.y2) !== 0)
      y = 1 - y;

    return new Vector2(x, y);
  }

  protected *computeLayoutPositions(): Iterable<Vector2> {
    let maxX = this.maximumSize.x;
    let maxY = this.maximumSize.y;

    if (this.maximumSize.equals(Vector2.Zero)) {
      const s = this.childSize;

      // If we are autosize and haven't specified a maximum size, we should allow infinite expansion.
      // If we are inheriting then we need to use the parent size (our ActualSize).
      maxX = (this.autoSizeAxes & Axes.X) !== 0 ? FLOAT_MAX : s.x;
      maxY = (this.autoSizeAxes & Axes.Y) !== 0 ? FLOAT_MAX : s.y;
    }


    const children = this.flowingChildren;
    if (children.length === 0)
      return;

    // The positions for each child we will return later on.
    const layoutPositions: Vector2[] = new Array(children.length);

    // We need to keep track of row widths such that we can compute correct
    // positions for horizontal centre anchor children.
    // We also store for each child to which row it belongs.
    const rowIndices: number[] = new Array(children.length);

    const rowOffsetsToMiddle: number[] = [0];

    // Variables keeping track of the current state while iterating over children
    // and computing initial flow positions.
    let rowHeight = 0;
    let rowBeginOffset = 0;
    let currentX = 0;
    let currentY = 0;

    // First pass, computing initial flow positions
    let size = Vector2.Zero;

    const toAxes = (direction: FillDirection) => direction === FillDirection.Full ? Axes.Both : direction === FillDirection.Horizontal ? Axes.X : Axes.Y;

    for (let i = 0; i < children.length; ++i) {
      let c = children[i];

      // In some cases (see the right hand side of the conditional) we want to permit relatively sized children
      // in our fill direction; specifically, when children use FillMode.Fit to preserve the aspect ratio.
      if ((c.relativeSizeAxes & this.autoSizeAxes & toAxes(this.direction)) !== 0
        && (c.fillMode !== FillMode.Fit || c.relativeSizeAxes !== Axes.Both || c.size.x > this.relativeChildSize.x
          || c.size.y > this.relativeChildSize.y || this.autoSizeAxes === Axes.Both)) {
        throw new Error('Drawables inside a fill flow container may not have a relative size axis that the fill flow container is filling in and auto sizing for. '
          + `The fill flow container is set to flow in the ${FillDirection[this.direction]} direction and autosize in ${this.autoSizeAxes} axes and the child is set to relative size in ${c.relativeSizeAxes} axes.`);
      }

      // Populate running variables with sane initial values.
      if (i === 0) {
        size = c.boundingBox.size;
        rowBeginOffset = this.spacingFactor(c).x * size.x;
      }

      const rowWidth = rowBeginOffset + currentX + (1 - this.spacingFactor(c).x) * size.x;

      //We've exceeded our allowed width, move to a new row
      if (this._direction !== FillDirection.Horizontal && (Precision.definitelyBigger(rowWidth, maxX) || this._direction === FillDirection.Vertical)) {
        currentX = 0;
        currentY += rowHeight;

        layoutPositions[i] = new Vector2(currentX, currentY);

        rowOffsetsToMiddle.push(0);
        rowBeginOffset = this.spacingFactor(c).x * size.x;

        rowHeight = 0;
      } else {
        layoutPositions[i] = new Vector2(currentX, currentY);

        // Compute offset to the middle of the row, to be applied in case of centre anchor
        // in a second pass.
        rowOffsetsToMiddle[rowOffsetsToMiddle.length - 1] = rowBeginOffset - rowWidth / 2;
      }

      rowIndices[i] = rowOffsetsToMiddle.length - 1;

      let stride = Vector2.Zero;

      if (i < children.length - 1) {
        // Compute stride. Note, that the stride depends on the origins of the drawables
        // on both sides of the step to be taken.
        stride = Vector2.One.sub(this.spacingFactor(c)).mul(size);

        c = children[i + 1];
        size = c.boundingBox.size;

        stride = stride.add(this.spacingFactor(c).mul(size));
      }

      stride = stride.add(this.spacing);

      if (stride.y > rowHeight)
        rowHeight = stride.y;
      currentX += stride.x;
    }

    const height = layoutPositions[children.length - 1].y;

    const ourRelativeAnchor = children[0].relativeAnchorPosition;

    // Second pass, adjusting the positions for anchors of children.
    // Uses rowWidths and height for centre-anchors.
    for (let i = 0; i < children.length; i++) {
      const c = children[i];

      switch (this.direction) {
        case FillDirection.Vertical:
          if (c.relativeAnchorPosition.y !== ourRelativeAnchor.y)
            throw new Error(`All drawables in a FillFlowContainer must use the same RelativeAnchorPosition for the given FillDirection(Vertical) (${ourRelativeAnchor.y} != ${c.relativeAnchorPosition.y}). Consider using multiple instances of FillFlowContainer if this is intentional.`);
          break;

        case FillDirection.Horizontal:
          if (c.relativeAnchorPosition.x !== ourRelativeAnchor.x)
            throw new Error(`All drawables in a FillFlowContainer must use the same RelativeAnchorPosition for the given FillDirection(Horizontal) (${ourRelativeAnchor.x} != ${c.relativeAnchorPosition.x}). Consider using multiple instances of FillFlowContainer if this is intentional.`);
          break;

        default:
          if (!c.relativeAnchorPosition.equals(ourRelativeAnchor))
            throw new Error(`All drawables in a FillFlowContainer must use the same RelativeAnchorPosition for the given FillDirection(Full) (${ourRelativeAnchor} != ${c.relativeAnchorPosition}). Consider using multiple instances of FillFlowContainer if this is intentional.`);
          break;
      }

      let { x, y } = layoutPositions[i];

      if ((c.anchor & Anchor.x1) !== 0)
        // Begin flow at centre of row
        x += rowOffsetsToMiddle[rowIndices[i]];
      else if ((c.anchor & Anchor.x2) !== 0)
        // Flow right-to-left
        x = -x;

      if ((c.anchor & Anchor.y1) !== 0)
        // Begin flow at centre of total height
        y -= height / 2;
      else if ((c.anchor & Anchor.y2) !== 0)
        // Flow bottom-to-top
        y = -y;

      yield new Vector2(x, y);
    }
  }
}
