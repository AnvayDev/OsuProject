// Ported from osu.Game/Graphics/UserInterface/ShearedRangeSlider.cs
// Tooltips (BoundSliderBar.TooltipText) aren't ported yet.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import { BindableNumberWithCurrent } from '@fw/bindables/BindableNumber';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { Box } from '@fw/graphics/shapes/Box';
import type { HoverEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuColour } from '../OsuColour';
import { FontWeight, OsuFont, withFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { ShearedNub } from './ShearedNub';
import { ShearedSliderBar } from './ShearedSliderBar';

/** ({0:N1}) */
const formatN1 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export class ShearedRangeSlider extends CompositeDrawable {
  private readonly label: string;

  private readonly lowerBoundBindable = new BindableNumberWithCurrent();

  /** The lower limiting value. */
  get lowerBound(): Bindable<number> {
    return this.lowerBoundBindable.current;
  }

  set lowerBound(value: Bindable<number>) {
    this.lowerBoundBindable.current = value;
  }

  private readonly upperBoundBindable = new BindableNumberWithCurrent();

  /** The upper limiting value. */
  get upperBound(): Bindable<number> {
    return this.upperBoundBindable.current;
  }

  set upperBound(value: Bindable<number>) {
    this.upperBoundBindable.current = value;
  }

  nubWidth = 0;

  /** Minimum difference between the lower bound and higher bound. */
  set minRange(value: number) {
    this._minRange = value;
  }

  /** Lower bound display for when it is set to its default value, or null to display the value directly. */
  defaultStringLowerBound: string | null = null;

  /** Upper bound display for when it is set to its default value, or null to display the value directly. */
  defaultStringUpperBound: string | null = null;

  private _minRange = 0.1;

  protected sliderContainer!: Container;

  /** (protected) */
  lowerBoundSlider!: BoundSliderBar;
  /** (protected) */
  upperBoundSlider!: BoundSliderBar;

  /** (protected) */
  get screenSpaceHalfwayPoint(): Vector2 {
    const lowerSS = this.lowerBoundSlider.nubDrawable.screenSpaceDrawQuad.topLeft;
    const upperSS = this.upperBoundSlider.nubDrawable.screenSpaceDrawQuad.topLeft;

    return lowerSS.add(upperSS.sub(lowerSS).div(2));
  }

  constructor(label: string) {
    super();

    this.label = label;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.height = ShearedNub.HEIGHT;

    const upperBoundSlider = this.upperBoundSlider = this.createBoundSlider(true);
    upperBoundSlider.keyboardStep = 0.1;
    upperBoundSlider.relativeSizeAxes = Axes.X;
    upperBoundSlider.defaultString = this.defaultStringUpperBound;
    upperBoundSlider.nubWidth = this.nubWidth;
    upperBoundSlider.current = this.upperBoundBindable;

    const lowerBoundSlider = this.lowerBoundSlider = this.createBoundSlider(false);
    lowerBoundSlider.keyboardStep = 0.1;
    lowerBoundSlider.relativeSizeAxes = Axes.X;
    lowerBoundSlider.defaultString = this.defaultStringLowerBound;
    lowerBoundSlider.nubWidth = this.nubWidth;
    lowerBoundSlider.current = this.lowerBoundBindable;

    this.internalChild = new GridContainer().with({
      relativeSizeAxes: Axes.Both,
      columnDimensions: [
        new Dimension(GridSizeMode.AutoSize),
        new Dimension(),
      ],
      content: [
        [
          new Container().with({
            autoSizeAxes: Axes.X,
            relativeSizeAxes: Axes.Y,
            masking: true,
            cornerRadius: 5,
            shear: OsuGame.SHEAR,
            children: [
              new Box().with({
                relativeSizeAxes: Axes.Both,
                colour: colourProvider.background3,
              }),
              new OsuSpriteText().with({
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                text: this.label,
                shear: OsuGame.SHEAR.neg(),
                margin: MarginPadding.of({ horizontal: 12, vertical: 5 }),
                font: withFont(OsuFont.Style.Body, { weight: FontWeight.SemiBold }),
              }),
            ],
          }),
          this.sliderContainer = new Container().with({
            relativeSizeAxes: Axes.Both,
            padding: MarginPadding.of({ left: -10 }),
            children: [
              upperBoundSlider,
              lowerBoundSlider,
              upperBoundSlider.nubDrawable.createProxy(),
              lowerBoundSlider.nubDrawable.createProxy(),
            ],
          }),
        ],
      ],
    });

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.lowerBoundSlider.current.valueChanged.add(min => this.upperBoundSlider.current.value = Math.max(min.newValue + this._minRange, this.upperBoundSlider.current.value));
    this.upperBoundSlider.current.valueChanged.add(max => this.lowerBoundSlider.current.value = Math.min(max.newValue - this._minRange, this.lowerBoundSlider.current.value));
  }

  protected createBoundSlider(isUpper: boolean): BoundSliderBar {
    return new BoundSliderBar(this, isUpper);
  }
}

/** (ShearedRangeSlider.BoundSliderBar) */
export class BoundSliderBar extends ShearedSliderBar {
  private readonly rangeSlider: ShearedRangeSlider;
  private readonly isUpper: boolean;

  /** (new NormalizedValue: public) */
  get normalizedValuePublic(): number {
    return this.normalizedValue;
  }

  /** (new Nub: public) */
  get nubDrawable(): ShearedNub {
    return this.nub;
  }

  defaultString: string | null = null;

  nubWidth = ShearedNub.HEIGHT;

  protected nubText!: OsuSpriteText;

  override get acceptsFocus(): boolean {
    return false;
  }

  constructor(rangeSlider: ShearedRangeSlider, isUpper: boolean) {
    super();

    this.rangeSlider = rangeSlider;
    this.isUpper = isUpper;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.nub.width = this.nubWidth;
    this.rangePadding = this.nub.width / 2;

    this.nub.add(this.nubText = new OsuSpriteText().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      x: -3,
      useFullGlyphHeight: false,
      colour: OsuColour.foregroundTextColourFor(colourProvider.light1),
      font: withFont(OsuFont.Style.Body, { weight: FontWeight.SemiBold }),
    }));

    this.accentColour = colourProvider.highlight1.darken(0.1);
    this.nub.accentColour = colourProvider.highlight1;
    this.nub.glowingAccentColour = colourProvider.highlight1;
    this.nub.glowColour = colourProvider.highlight1;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    if (!this.isUpper) {
      this.accentColour = this.backgroundColour;
      this.backgroundColour = Colour4.Transparent;
    }

    this.current.bindValueChanged(current => this.updateDisplay(current.newValue), true);
    this.finishTransforms(true);
  }

  protected updateDisplay(value: number): void {
    if (this.current.isDefault && this.defaultString !== null)
      this.nubText.text = this.defaultString;
    else
      this.nubText.text = formatN1(value);
  }

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    if (this.isUpper)
      return super.receivePositionalInputAt(screenSpacePos) && screenSpacePos.x > this.rangeSlider.screenSpaceHalfwayPoint.x;

    return super.receivePositionalInputAt(screenSpacePos) && screenSpacePos.x <= this.rangeSlider.screenSpaceHalfwayPoint.x;
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    if (this.isUpper) {
      // Only draw left box where required to avoid masking bleed issues.
      this.leftBox.x = this.toParentSpace(this.toLocalSpace(this.rangeSlider.lowerBoundSlider.nubDrawable.screenSpaceDrawQuad.centre)).x;
      this.leftBox.size = this.leftBox.size.sub(new Vector2(this.leftBox.x, 0));
    }
  }

  protected override onHover(e: HoverEvent): boolean {
    super.onHover(e);
    return true; // Make sure only one nub shows hover effect at once.
  }
}
