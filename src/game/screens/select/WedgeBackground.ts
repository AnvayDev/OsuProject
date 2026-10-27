// Ported from osu.Game/Screens/Select/WedgeBackground.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes } from '@fw/layout/Enums';
import { InputBlockingContainer } from '../../graphics/InputBlockingContainer';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

export class WedgeBackground extends InputBlockingContainer {
  startAlpha = 0.9;

  finalAlpha = 0.6;

  widthForGradient = 0.3;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.relativeSizeAxes = Axes.Both;

    this.internalChildren = [
      new Box().with({
        blending: BlendingParameters.Additive,
        relativeSizeAxes: Axes.Both,
        width: 0.6,
        alpha: 0.5,
        colour: ColourInfo.gradientHorizontal(colourProvider.background2, colourProvider.background2.opacity(0)),
      }),
      new Box().with({
        relativeSizeAxes: Axes.Both,
        width: Math.fround(1 - this.widthForGradient),
        colour: colourProvider.background5.opacity(this.startAlpha),
      }),
      new Box().with({
        anchor: Anchor.TopRight,
        origin: Anchor.TopRight,
        relativeSizeAxes: Axes.Both,
        width: this.widthForGradient,
        colour: ColourInfo.gradientHorizontal(colourProvider.background5.opacity(this.startAlpha), colourProvider.background5.opacity(this.finalAlpha)),
      }),
    ];

    return r;
  }
}
