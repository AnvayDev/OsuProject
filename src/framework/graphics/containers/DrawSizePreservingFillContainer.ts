// Ported from osu.Framework/Graphics/Containers/DrawSizePreservingFillContainer.cs

import { Axes } from '../../layout/Enums';
import { Vector2 } from '../../layout/Vector2';
import type { Drawable } from '../Drawable';
import { Container } from './Container';

/** Strategies used by DrawSizePreservingFillContainer to preserve the draw size. */
export enum DrawSizePreservationStrategy {
  /** Preserves the smaller of the two dimensions; the larger dimension may grow. */
  Minimum,

  /** Preserves the larger of the two dimensions; the smaller dimension may shrink. */
  Maximum,

  /** Preserves the average of both dimensions. */
  Average,

  /** Preserves both dimensions separately (distorts aspect ratio). */
  Separate,
}

/**
 * A container which retains the size of its children (in their coordinate space) regardless of its own size,
 * by scaling its content to fill itself. TargetDrawSize is the size children see along the preserved dimension(s).
 */
export class DrawSizePreservingFillContainer extends Container {
  private readonly contentContainer: Container;

  protected override get content(): Container {
    return this.contentContainer;
  }

  /** The target size to preserve. */
  targetDrawSize = new Vector2(1024, 768);

  /** The strategy to use for preserving the draw size. */
  strategy = DrawSizePreservationStrategy.Minimum;

  constructor() {
    super();

    this.addInternal(this.contentContainer = new Container().with({
      relativeSizeAxes: Axes.Both,
    }));

    this.relativeSizeAxes = Axes.Both;
  }

  protected override update(): void {
    super.update();

    const drawSizeRatio = this.parent!.childSize.div(this.targetDrawSize);

    switch (this.strategy) {
      case DrawSizePreservationStrategy.Minimum:
        this.contentContainer.scale = new Vector2(Math.min(drawSizeRatio.x, drawSizeRatio.y));
        break;

      case DrawSizePreservationStrategy.Maximum:
        this.contentContainer.scale = new Vector2(Math.max(drawSizeRatio.x, drawSizeRatio.y));
        break;

      case DrawSizePreservationStrategy.Average:
        this.contentContainer.scale = new Vector2(0.5 * (drawSizeRatio.x + drawSizeRatio.y));
        break;

      case DrawSizePreservationStrategy.Separate:
        this.contentContainer.scale = drawSizeRatio;
        break;
    }

    const s = this.contentContainer.scale;
    this.contentContainer.size = new Vector2(
      s.x === 0 ? 0 : 1 / s.x,
      s.y === 0 ? 0 : 1 / s.y);
  }
}

