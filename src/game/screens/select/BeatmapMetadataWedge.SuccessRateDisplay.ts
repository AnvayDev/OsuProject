// Ported from osu.Game/Screens/Select/BeatmapMetadataWedge.SuccessRateDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Circle } from '@fw/graphics/shapes/Circle';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

export class SuccessRateDisplay extends CompositeDrawable {
  private readonly valueText: OsuSpriteText;
  private readonly backgroundBar: Circle;
  private readonly valueBar: Circle;

  private _data: { passes: number; plays: number } = { passes: 0, plays: 0 };

  get data(): { passes: number; plays: number } {
    return this._data;
  }

  set data(value: { passes: number; plays: number }) {
    this._data = value;

    const ratio = value.plays === 0 ? 0 : Math.fround(value.passes / value.plays);
    // (ToLocalisableString("0.##%"))
    this.valueText.text = `${Number((ratio * 100).toFixed(2))}%`;
    this.valueText.moveToX(Math.min(Math.max(ratio, 0.05), 0.95), 300, Easing.OutQuint);
    this.valueBar.resizeWidthTo(ratio, 300, Easing.OutQuint);
  }

  /** (IHasTooltip) */
  get tooltipText(): string {
    return `${this._data.passes.toLocaleString('en-US')} / ${this._data.plays.toLocaleString('en-US')}`;
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    let valueText!: OsuSpriteText;
    let backgroundBar!: Circle;
    let valueBar!: Circle;

    this.internalChildren = [
      new FillFlowContainer().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        direction: FillDirection.Vertical,
        spacing: new Vector2(0, 2),
        children: [
          new OsuSpriteText().with({
            text: 'Success Rate',
            font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.SemiBold }),
          }),
          new Container().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            margin: MarginPadding.of({ top: 10 }),
            child: valueText = new OsuSpriteText().with({
              origin: Anchor.TopCentre,
              relativePositionAxes: Axes.X,
              font: OsuFont.Style.Caption1,
            }),
          }),
          new Container().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            children: [
              backgroundBar = new Circle().with({
                relativeSizeAxes: Axes.X,
                height: 4,
              }),
              valueBar = new Circle().with({
                relativeSizeAxes: Axes.X,
                width: 0,
                height: 4,
              }),
            ],
          }),
        ],
      }),
    ];

    this.valueText = valueText;
    this.backgroundBar = backgroundBar;
    this.valueBar = valueBar;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.backgroundBar.colour = colourProvider.background6;
    this.valueBar.colour = colours.lime1;
    this.valueText.colour = colourProvider.content2;

    return r;
  }
}
