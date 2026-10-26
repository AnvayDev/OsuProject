// Ported from osu.Game/Graphics/UserInterface/ShearedNub.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { ClickEvent, DoubleClickEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuColour } from '../OsuColour';

export class ShearedNub extends Container {
  onDoubleClicked: (() => void) | null = null;

  static readonly HEIGHT = 30;
  static readonly EXPANDED_SIZE = 50;
  static readonly CORNER_RADIUS = 5;

  private readonly fill: Box;
  private readonly main: Container;
  private readonly shadow: Container;

  constructor() {
    super();

    this.size = new Vector2(ShearedNub.EXPANDED_SIZE, ShearedNub.HEIGHT);

    let fill!: Box;

    this.internalChildren = [
      this.shadow = new Container().with({
        shear: OsuGame.SHEAR,
        masking: true,
        cornerRadius: ShearedNub.CORNER_RADIUS,
        relativeSizeAxes: Axes.Both,
        edgeEffect: new EdgeEffectParameters({
          type: EdgeEffectType.Shadow,
          radius: 20,
        }),
        child: new Box().with({
          relativeSizeAxes: Axes.Both,
          alpha: 0,
          alwaysPresent: true,
        }),
      }),
      this.main = new Container().with({
        shear: OsuGame.SHEAR,
        borderColour: Colour4.White,
        borderThickness: 8,
        masking: true,
        cornerRadius: ShearedNub.CORNER_RADIUS,
        relativeSizeAxes: Axes.Both,
        anchor: Anchor.TopCentre,
        origin: Anchor.TopCentre,
        child: fill = new Box().with({
          relativeSizeAxes: Axes.Both,
          alpha: 0,
          alwaysPresent: true,
        }),
      }),
    ];

    this.fill = fill;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.get(OverlayColourProvider);
    const colours = dependencies.resolve(OsuColour);

    this.accentColour = colourProvider?.highlight1 ?? colours.pink;
    this.glowingAccentColour = colourProvider?.highlight1.lighten(0.4) ?? colours.pinkLighter;
    this.glowColour = colourProvider?.highlight1 ?? colours.pinkLighter;

    this.main.edgeEffect = new EdgeEffectParameters({
      colour: this.glowColour.opacity(0),
      type: EdgeEffectType.Glow,
      radius: 8,
      roundness: 4,
    });

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.current.bindValueChanged(this.onCurrentValueChanged, true);
    this.finishTransforms(true);
  }

  private _glowing = false;

  get glowing(): boolean {
    return this._glowing;
  }

  set glowing(value: boolean) {
    if (this._glowing === value)
      return;

    this._glowing = value;
    this.updateDisplay();
  }

  private _shadowColour = Colour4.Black.opacity(0);

  get shadowColour(): Colour4 {
    return this._shadowColour;
  }

  set shadowColour(value: Colour4) {
    if (this._shadowColour.equals(value))
      return;

    this._shadowColour = value;
    this.shadow.fadeEdgeEffectTo(value, 800, Easing.OutQuint);
  }

  private readonly _current = new Bindable<boolean>(false);

  get current(): Bindable<boolean> {
    return this._current;
  }

  set current(value: Bindable<boolean>) {
    this._current.unbindBindings();
    this._current.bindTo(value);
  }

  private _accentColour = Colour4.Black;

  get accentColour(): Colour4 {
    return this._accentColour;
  }

  set accentColour(value: Colour4) {
    this._accentColour = value;
    this.updateDisplay();
  }

  private _glowingAccentColour = Colour4.Black;

  get glowingAccentColour(): Colour4 {
    return this._glowingAccentColour;
  }

  set glowingAccentColour(value: Colour4) {
    this._glowingAccentColour = value;
    this.updateDisplay();
  }

  private _glowColour = Colour4.Black;

  get glowColour(): Colour4 {
    return this._glowColour;
  }

  set glowColour(value: Colour4) {
    this._glowColour = value;
    this.updateDisplay();
  }

  private readonly onCurrentValueChanged = (filled: ValueChangedEvent<boolean>): void => {
    const duration = 200;

    this.fill.fadeTo(filled.newValue ? 1 : 0, duration, Easing.OutQuint);

    if (filled.newValue) {
      this.main.resizeWidthTo(1, duration, Easing.OutElasticHalf);
      this.main.transformTo('borderThickness', 8.5, duration, Easing.OutElasticHalf);
    } else {
      this.main.resizeWidthTo(0.75, duration, Easing.OutQuint);
      this.main.transformTo('borderThickness', 8, duration, Easing.OutQuint);
    }
  };

  private updateDisplay(): void {
    if (this.glowing) {
      this.main.fadeColour(this.glowingAccentColour.lighten(0.1), 40, Easing.OutQuint)
        .then()
        .fadeColour(this.glowingAccentColour, 800, Easing.OutQuint);

      this.main.fadeEdgeEffectTo(Colour4.White.opacity(0.1), 40, Easing.OutQuint)
        .then()
        .fadeEdgeEffectTo(this.glowColour.opacity(0.1), 800, Easing.OutQuint);
    } else {
      this.main.fadeEdgeEffectTo(this.glowColour.opacity(0), 800, Easing.OutQuint);
      this.main.fadeColour(this.accentColour, 800, Easing.OutQuint);
    }
  }

  protected override onClick(_e: ClickEvent): boolean {
    return true;
  }

  protected override onDoubleClick(_e: DoubleClickEvent): boolean {
    this.onDoubleClicked?.();
    return true;
  }
}
