// Ported from osu.Game/Screens/Select/BeatmapMetadataWedge.FailRetryDisplay.cs
// DOM: GraphDrawable's DrawNode (each bar a FastCircle-shaded quad: a rectangle with fully rounded ends) draws on a canvas.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { CanvasDrawable } from '@fw/graphics/CanvasDrawable';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { dampContinuously } from '@fw/transforms/Interpolation';
import type { APIFailTimes } from '../../online/api/requests/responses/APIBeatmap';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';

export class FailRetryDisplay extends CompositeDrawable {
  private readonly retriesGraph: GraphDrawable;
  private readonly failsGraph: GraphDrawable;

  set data(value: APIFailTimes) {
    const retries = value.retries ?? [];
    const fails = value.fails ?? [];

    const total = retries.slice(0, Math.min(retries.length, fails.length)).map((r, i) => r + fails[i]);
    const maximum = total.length === 0 ? 0 : Math.max(...total);

    this.retriesGraph.data = total.map(r => maximum === 0 ? 0 : Math.fround(r / maximum));
    this.failsGraph.data = fails.map(r => maximum === 0 ? 0 : Math.fround(r / maximum));
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    let retriesGraph!: GraphDrawable;
    let failsGraph!: GraphDrawable;

    this.internalChild = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
      spacing: new Vector2(0, 4),
      children: [
        new OsuSpriteText().with({
          text: 'Points of Failure',
          font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.SemiBold }),
          margin: MarginPadding.of({ bottom: 4 }),
        }),
        new Container().with({
          relativeSizeAxes: Axes.X,
          height: 65,
          children: [
            retriesGraph = new GraphDrawable().with({ relativeSizeAxes: Axes.Both, y: -1 }),
            failsGraph = new GraphDrawable().with({ relativeSizeAxes: Axes.Both }),
          ],
        }),
      ],
    });

    this.retriesGraph = retriesGraph;
    this.failsGraph = failsGraph;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    this.retriesGraph.colour = colours.orange1;
    this.failsGraph.colour = colours.darkOrange2;

    return r;
  }
}

class GraphDrawable extends CanvasDrawable {
  private readonly displayedData = new Array<number>(100).fill(0);
  private _data: number[] = new Array<number>(100).fill(0);

  get data(): number[] {
    return this._data;
  }

  set data(value: number[]) {
    this._data = value;
    this.invalidateDraw();
  }

  protected override update(): void {
    super.update();

    let changed = false;

    for (let i = 0; i < this.displayedData.length; i++) {
      const before = this.displayedData[i];
      const value = this._data[i] ?? 0;
      this.displayedData[i] = Math.fround(dampContinuously(this.displayedData[i], value, 40, this.time.elapsed));
      changed ||= this.displayedData[i] !== before;
    }

    if (changed)
      this.invalidateDraw();
  }

  // (GraphDrawNode.Draw)
  protected override draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const spacing_constant = 1.5;

    let position = 0;
    const barWidth = width / this.displayedData.length / spacing_constant;
    const totalSpacing = width - barWidth * this.displayedData.length;
    const spacing = totalSpacing / (this.displayedData.length - 1);

    const colour = this.drawColourInfo.colour.averageColour;
    ctx.fillStyle = `rgba(${Math.round(colour.r * 255)}, ${Math.round(colour.g * 255)}, ${Math.round(colour.b * 255)}, ${colour.a})`;
    ctx.beginPath();

    for (const value of this.displayedData) {
      const barHeight = Math.max(height * value, barWidth);
      // (FastCircle: corners rounded by half the shorter side)
      ctx.roundRect(position, height - barHeight, barWidth, barHeight, barWidth / 2);
      position += barWidth + spacing;
    }

    ctx.fill();
  }
}
