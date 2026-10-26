// Ported from osu.Game/Graphics/UserInterface/ShearedSliderBar.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { DragEndEvent, FocusEvent, FocusLostEvent, HoverEvent, HoverLostEvent, MouseDownEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuColour } from '../OsuColour';
import { HoverClickSounds } from './HoverClickSounds';
import { OsuSliderBar } from './OsuSliderBar';
import { ShearedNub } from './ShearedNub';

export class ShearedSliderBar extends OsuSliderBar {
  protected readonly nub: ShearedNub;
  protected readonly leftBox: Box;
  protected readonly rightBox: Box;
  private readonly nubContainer: Container;

  private readonly hoverClickSounds: HoverClickSounds;

  private readonly mainContent: Container;

  protected get focusIndicator(): boolean {
    return true;
  }

  private _accentColour!: Colour4;

  get accentColour(): Colour4 {
    return this._accentColour;
  }

  set accentColour(value: Colour4) {
    this._accentColour = value;

    // We want to slightly darken the colour for the box because the sheared slider has the boxes at the same height as the nub,
    // making the nub invisible when not hovered.
    this.leftBox.colour = value.darken(0.1);
  }

  private _backgroundColour!: Colour4;

  get backgroundColour(): Colour4 {
    return this._backgroundColour;
  }

  set backgroundColour(value: Colour4) {
    this._backgroundColour = value;
    this.rightBox.colour = value;
  }

  get nubShadowColour(): Colour4 {
    return this.nub.shadowColour;
  }

  set nubShadowColour(value: Colour4) {
    this.nub.shadowColour = value;
  }

  constructor() {
    super();

    this.shear = OsuGame.SHEAR;
    this.height = ShearedNub.HEIGHT;
    this.rangePadding = ShearedNub.EXPANDED_SIZE / 2;

    let leftBox!: Box;
    let rightBox!: Box;
    let nub!: ShearedNub;

    this.children = [
      this.mainContent = new Container().with({
        relativeSizeAxes: Axes.Both,
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        masking: true,
        cornerRadius: 5,
        children: [
          leftBox = new Box().with({
            edgeSmoothness: new Vector2(0, 0.5),
            relativeSizeAxes: Axes.Y,
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
          }),
          rightBox = new Box().with({
            edgeSmoothness: new Vector2(0, 0.5),
            relativeSizeAxes: Axes.Y,
            anchor: Anchor.CentreRight,
            origin: Anchor.CentreRight,
          }),
        ],
      }),
      this.nubContainer = new Container().with({
        shear: OsuGame.SHEAR.neg(),
        relativeSizeAxes: Axes.Both,
        child: nub = new ShearedNub().with({
          origin: Anchor.TopCentre,
          relativePositionAxes: Axes.X,
          onDoubleClicked: () => {
            if (!this.current.disabled)
              this.current.setDefault();
          },
        }),
      }),
      this.hoverClickSounds = new HoverClickSounds(),
    ];

    nub.current.value = true;

    this.leftBox = leftBox;
    this.rightBox = rightBox;
    this.nub = nub;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.get(OverlayColourProvider);
    const colours = dependencies.resolve(OsuColour);

    this.accentColour = colourProvider?.highlight1 ?? colours.pink;
    this.backgroundColour = colourProvider?.background5 ?? colours.pinkDarker.darken(1);

    return r;
  }

  protected override update(): void {
    super.update();

    this.nubContainer.padding = MarginPadding.of({ horizontal: this.rangePadding });
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.current.bindDisabledChanged(disabled => {
      this.alpha = disabled ? 0.3 : 1;
      this.hoverClickSounds.enabled.value = !disabled;
    }, true);
  }

  protected override onFocus(e: FocusEvent): void {
    super.onFocus(e);

    if (this.focusIndicator) {
      this.mainContent.edgeEffect = new EdgeEffectParameters({
        type: EdgeEffectType.Glow,
        colour: this.accentColour.darken(1),
        hollow: true,
        radius: 2,
      });
    }
  }

  protected override onFocusLost(e: FocusLostEvent): void {
    super.onFocusLost(e);

    this.mainContent.edgeEffect = new EdgeEffectParameters();
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateGlow();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateGlow();
    super.onHoverLost(e);
  }

  protected override shouldHandleAsRelativeDrag(e: MouseDownEvent): boolean {
    return this.nub.receivePositionalInputAt(e.screenSpaceMouseDownPosition);
  }

  protected override onDragEnd(e: DragEndEvent): void {
    this.updateGlow();
    super.onDragEnd(e);
  }

  private updateGlow(): void {
    this.nub.glowing = !this.current.disabled && (this.isHovered || this.isDragged);
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    const clamp = (v: number) => Math.min(Math.max(v, 0), Math.max(0, this.drawWidth));

    this.leftBox.size = new Vector2(clamp(this.rangePadding + this.nub.drawPosition.x - this.nub.drawWidth / 2 + ShearedNub.CORNER_RADIUS - 0.5), 1);
    this.rightBox.size = new Vector2(clamp(this.drawWidth - this.rangePadding - this.nub.drawPosition.x - this.nub.drawWidth / 2 + ShearedNub.CORNER_RADIUS - 0.5), 1);
  }

  protected override updateValue(value: number): void {
    this.nub.moveToX(value, 250, Easing.OutQuint);
  }
}
