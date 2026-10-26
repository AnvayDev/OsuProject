// Ported from osu.Game/Screens/Select/FilterControl.DifficultyRangeSlider.cs
// Tooltips (DifficultyBoundSliderBar.TooltipText) aren't ported yet.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Container } from '@fw/graphics/containers/Container';
import { Box } from '@fw/graphics/shapes/Box';
import { Axes, Invalidation } from '@fw/layout/Enums';
import { LayoutValue } from '@fw/layout/Layout';
import { Easing } from '@fw/transforms/Easing';
import { valueAt } from '@fw/transforms/Interpolation';
import { OsuColour } from '../../graphics/OsuColour';
import { BoundSliderBar, ShearedRangeSlider } from '../../graphics/userInterface/ShearedRangeSlider';
import { ShearedNub } from '../../graphics/userInterface/ShearedNub';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { ColourUtils } from '../../utils/ColourUtils';

const spectrum: readonly (readonly [number, Colour4])[] = [
  [0, OsuColour.STAR_DIFFICULTY_SPECTRUM[1][1]],
  ...OsuColour.STAR_DIFFICULTY_SPECTRUM.slice(1),
];

/** (Math.Round(value, 2, MidpointRounding.AwayFromZero), as a float) */
const roundAwayFromZero2 = (value: number) => Math.fround(Math.sign(value) * Math.round(Math.abs(value) * 100) / 100);

/** (FilterControl.DifficultyRangeSlider) */
export class DifficultyRangeSlider extends ShearedRangeSlider {
  private borderContainer!: Container;

  private readonly drawSizeLayout = new LayoutValue(Invalidation.DrawSize);

  constructor() {
    super('Star Rating');

    this.nubWidth = Math.fround(ShearedNub.HEIGHT * 1.16);
    this.defaultStringUpperBound = '∞';

    this.addLayout(this.drawSizeLayout);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.sliderContainer.addRange([
      new Container().with({
        depth: 1,
        relativeSizeAxes: Axes.Both,
        shear: OsuGame.SHEAR,
        cornerRadius: 5,
        masking: true,
        children: spectrum.slice(0, -1).map((first, i) => {
          const second = spectrum[i + 1];

          return new Box().with({
            relativePositionAxes: Axes.X,
            x: Math.fround(first[0] / 10),
            relativeSizeAxes: Axes.Both,
            width: Math.fround((second[0] - first[0]) / 10),
            colour: ColourInfo.gradientHorizontal(first[1], second[1]),
          });
        }),
      }),
      this.borderContainer = new Container().with({
        depth: -1,
        relativePositionAxes: Axes.X,
        relativeSizeAxes: Axes.Both,
        child: new Container().with({
          relativeSizeAxes: Axes.Both,
          borderColour: colourProvider.highlight1,
          borderThickness: 2,
          masking: true,
          shear: OsuGame.SHEAR,
          cornerRadius: 5,
          child: new Box().with({
            colour: Colour4.Transparent,
            relativeSizeAxes: Axes.Both,
          }),
        }),
      }),
    ]);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.lowerBoundSlider.current.valueChanged.add(() => this.updateBorderDisplay(false));
    this.upperBoundSlider.current.valueChanged.add(() => this.updateBorderDisplay(false));
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    if (!this.drawSizeLayout.isValid) {
      this.updateBorderDisplay(true);
      this.drawSizeLayout.validate();
    }
  }

  private updateBorderDisplay(instant: boolean): void {
    const borderStart = Math.fround(this.lowerBoundSlider.normalizedValuePublic * this.lowerBoundSlider.usableWidth / this.lowerBoundSlider.drawWidth);
    let borderEnd = Math.fround(this.upperBoundSlider.normalizedValuePublic * this.upperBoundSlider.usableWidth / this.upperBoundSlider.drawWidth);
    borderEnd = Math.fround(borderEnd + this.upperBoundSlider.nubWidth / this.upperBoundSlider.drawWidth);

    this.borderContainer.moveToX(borderStart, instant ? 0 : 250, Easing.OutQuint);
    this.borderContainer.resizeWidthTo(borderEnd - borderStart, instant ? 0 : 250, Easing.OutQuint);
  }

  protected override createBoundSlider(isUpper: boolean): BoundSliderBar {
    return new DifficultyBoundSliderBar(this, isUpper);
  }
}

/** (DifficultyRangeSlider.DifficultyBoundSliderBar) */
class DifficultyBoundSliderBar extends BoundSliderBar {
  private readonly isUpperBound: boolean;

  protected override get focusIndicator(): boolean {
    return false;
  }

  private colours!: OsuColour;

  constructor(slider: ShearedRangeSlider, isUpper: boolean) {
    super(slider, isUpper);
    this.isUpperBound = isUpper;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colours = dependencies.resolve(OsuColour);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    if (this.isUpperBound) {
      this.leftBox.colour = OsuColour.gray(0.4).opacity(0.2);
      this.rightBox.colour = OsuColour.gray(0.05).opacity(0.7);
    } else {
      this.leftBox.colour = OsuColour.gray(0.05).opacity(0.7);
      this.rightBox.colour = OsuColour.gray(0.4).opacity(0.2);
    }
  }

  protected override updateDisplay(value: number): void {
    let nubColour = ColourUtils.sampleFromLinearGradient(spectrum, roundAwayFromZero2(value));

    // Handle edge case colors for color harmony
    if (value >= 7.5 && value < 8.0)
      nubColour = valueAt(value, nubColour, this.colours.gray4, 7.5, 8.0);
    else if (value >= 8.0)
      nubColour = this.colours.gray4;

    this.nub.accentColour = nubColour;
    this.nub.glowingAccentColour = nubColour.lighten(0.1);
    this.nub.shadowColour = Colour4.Black.opacity(0.2);
    this.nubText.colour = this.colours.forStarDifficultyText(value);
    // Except for infinity, which should be white
    if (this.current.isDefault && this.isUpperBound)
      this.nubText.colour = OsuColour.foregroundTextColourFor(nubColour);

    super.updateDisplay(value);
  }
}
