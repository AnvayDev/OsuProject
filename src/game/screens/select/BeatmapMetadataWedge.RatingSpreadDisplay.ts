// Ported from osu.Game/Screens/Select/BeatmapMetadataWedge.RatingSpreadDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { valueAt } from '@fw/transforms/Interpolation';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';

const min_height = 4;
const max_height = 32;
const rating_range = 10;

export class RatingSpreadDisplay extends CompositeDrawable {
  private readonly graph: GraphBar[];

  set data(value: readonly number[]) {
    if (value.length === 0) {
      for (const bar of this.graph)
        bar.resizeHeightTo(min_height, 300, Easing.OutQuint);
    } else {
      const usableRange = value.slice(1, 1 + rating_range); // adjust for API returning weird empty data at 0.
      const maxRating = Math.max(...usableRange);

      for (let i = 0; i < this.graph.length; i++)
        this.graph[i].resizeHeightTo(min_height + (max_height - min_height) * (maxRating === 0 ? 0 : Math.fround((usableRange[i] ?? 0) / maxRating)), 300, Easing.OutQuint);
    }
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    this.graph = Array.from({ length: rating_range }, () => new GraphBar());

    const columns: Dimension[] = [];
    const cells: Drawable[] = [];

    this.graph.forEach((g, i) => {
      columns.push(new Dimension());
      cells.push(g);

      if (i < this.graph.length - 1) {
        columns.push(new Dimension(GridSizeMode.Absolute, 1));
        cells.push(emptyDrawable());
      }
    });

    this.internalChildren = [
      new FillFlowContainer().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        direction: FillDirection.Vertical,
        spacing: new Vector2(0, 1),
        children: [
          new OsuSpriteText().with({
            text: 'Rating Spread',
            font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.SemiBold }),
          }),
          new GridContainer().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            rowDimensions: [new Dimension(GridSizeMode.Absolute, max_height)],
            columnDimensions: columns,
            content: [cells],
          }),
        ],
      }),
    ];
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    for (let i = 0; i < 10; i++) {
      const left = valueAt(i, colours.blue4, colours.blue0, 0, 10);
      const right = valueAt(i + 1, colours.blue4, colours.blue0, 0, 10);
      this.graph[i].colour = ColourInfo.gradientHorizontal(left, right);
    }

    return r;
  }
}

class GraphBar extends CompositeDrawable {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.anchor = Anchor.BottomLeft;
    this.origin = Anchor.BottomLeft;
    this.relativeSizeAxes = Axes.X;
    this.cornerRadius = 2;
    this.masking = true;
    this.internalChild = new Box().with({ relativeSizeAxes: Axes.Both });

    return r;
  }
}
