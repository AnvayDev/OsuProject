// Ported from osu.Game/Screens/Select/BeatmapMetadataWedge.UserRatingDisplay.cs

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

const rating_range = 10;

export class UserRatingDisplay extends CompositeDrawable {
  private readonly negativeText: OsuSpriteText;
  private readonly positiveText: OsuSpriteText;
  private readonly backgroundBar: Circle;
  private readonly positiveBar: Circle;

  set data(value: readonly number[]) {
    if (value.length === 0) {
      this.negativeText.text = '0';
      this.positiveText.text = '0';
      this.positiveBar.resizeWidthTo(0, 300, Easing.OutQuint);
    } else {
      const usableRange = value.slice(1, 1 + rating_range); // adjust for API returning weird empty data at 0.

      const positiveCount = usableRange.slice(rating_range / 2).reduce((a, b) => a + b, 0);
      const totalCount = usableRange.reduce((a, b) => a + b, 0);

      this.negativeText.text = (totalCount - positiveCount).toLocaleString('en-US');
      this.positiveText.text = positiveCount.toLocaleString('en-US');
      this.positiveBar.resizeWidthTo(totalCount === 0 ? 0 : Math.fround(positiveCount / totalCount), 300, Easing.OutQuint);
    }
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    let negativeText!: OsuSpriteText;
    let positiveText!: OsuSpriteText;
    let backgroundBar!: Circle;
    let positiveBar!: Circle;

    this.internalChildren = [
      new FillFlowContainer().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        direction: FillDirection.Vertical,
        spacing: new Vector2(0, 2),
        children: [
          new OsuSpriteText().with({
            text: 'User Rating',
            font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.SemiBold }),
          }),
          new Container().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            margin: MarginPadding.of({ top: 10 }),
            children: [
              negativeText = new OsuSpriteText().with({
                anchor: Anchor.TopLeft,
                origin: Anchor.TopLeft,
                font: OsuFont.Style.Caption1,
              }),
              positiveText = new OsuSpriteText().with({
                anchor: Anchor.TopRight,
                origin: Anchor.TopRight,
                font: OsuFont.Style.Caption1,
              }),
            ],
          }),
          new Container().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            children: [
              backgroundBar = new Circle().with({
                relativeSizeAxes: Axes.X,
                height: 4,
              }),
              positiveBar = new Circle().with({
                anchor: Anchor.TopRight,
                origin: Anchor.TopRight,
                relativeSizeAxes: Axes.X,
                width: 0,
                height: 4,
              }),
            ],
          }),
        ],
      }),
    ];

    this.negativeText = negativeText;
    this.positiveText = positiveText;
    this.backgroundBar = backgroundBar;
    this.positiveBar = positiveBar;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.backgroundBar.colour = colours.darkOrange2;
    this.positiveBar.colour = colours.lime1;
    this.negativeText.colour = colourProvider.content2;
    this.positiveText.colour = colourProvider.content2;

    return r;
  }
}
