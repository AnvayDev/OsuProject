// Ported from osu.Game/Graphics/UserInterface/DialogButton.cs
// The box's EdgeSmoothness and the triangles container's MaskingSmoothness are GL anti-aliasing settings with no DOM equivalent.

import { Signal } from '@fw/bindables/Signal';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { BlendingParameters, EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import type { IStateful } from '@fw/IStateful';
import type { ClickEvent, HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuGame } from '../../OsuGame';
import { TrianglesV2 } from '../backgrounds/TrianglesV2';
import { OsuClickableContainer } from '../containers/OsuClickableContainer';
import { FontWeight, OsuFont, withFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { HoverSampleSet } from './HoverSampleSet';
import { SelectionState } from './SelectionState';

const idle_width = Math.fround(0.8);
const hover_width = Math.fround(0.9);

const hover_duration = 400;
const click_duration = 200;

export class DialogButton extends OsuClickableContainer implements IStateful<SelectionState> {
  readonly stateChanged = new Signal<SelectionState>();

  private _state = SelectionState.NotSelected;

  get state(): SelectionState {
    return this._state;
  }

  set state(value: SelectionState) {
    if (this._state === value)
      return;

    this._state = value;
    this.stateChanged.emit(value);
  }

  private _text = '';

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
    this.spriteText.text = this.text;
  }

  get textSize(): number {
    return this.spriteText.font.size;
  }

  set textSize(value: number) {
    this.spriteText.font = withFont(this.spriteText.font, { size: value });
  }

  private _buttonColour = Colour4.Transparent;

  get buttonColour(): Colour4 {
    return this._buttonColour;
  }

  set buttonColour(value: Colour4) {
    this._buttonColour = value;
    this.updateColour();
  }

  protected readonly colourContainer: Container;

  private readonly glowContainer: Container;
  private readonly leftGlow: Box;
  private readonly centerGlow: Box;
  private readonly rightGlow: Box;
  private readonly spriteText: SpriteText;

  private get hoverSpacing(): Vector2 {
    return new Vector2(Math.fround(1.4), 0);
  }

  constructor(sampleSet = HoverSampleSet.Button) {
    super(sampleSet);

    this.relativeSizeAxes = Axes.X;

    let glowContainer!: Container, leftGlow!: Box, centerGlow!: Box, rightGlow!: Box, colourContainer!: Container, spriteText!: SpriteText;

    this.children = [
      glowContainer = new Container().with({
        origin: Anchor.Centre,
        anchor: Anchor.Centre,
        relativeSizeAxes: Axes.Both,
        shear: OsuGame.SHEAR,
        width: idle_width,
        alpha: 0,
        children: [
          leftGlow = new Box().with({
            relativeSizeAxes: Axes.Both,
            origin: Anchor.TopLeft,
            anchor: Anchor.TopLeft,
            width: Math.fround(0.125),
          }),
          centerGlow = new Box().with({
            relativeSizeAxes: Axes.Both,
            origin: Anchor.Centre,
            anchor: Anchor.Centre,
            width: Math.fround(0.75),
          }),
          rightGlow = new Box().with({
            relativeSizeAxes: Axes.Both,
            origin: Anchor.TopRight,
            anchor: Anchor.TopRight,
            width: Math.fround(0.125),
          }),
        ],
      }),
      new Container().with({
        relativeSizeAxes: Axes.Both,
        origin: Anchor.Centre,
        anchor: Anchor.Centre,
        masking: true,
        children: [
          colourContainer = new Container().with({
            cornerRadius: 5,
            relativeSizeAxes: Axes.Both,
            origin: Anchor.Centre,
            anchor: Anchor.Centre,
            width: idle_width,
            masking: true,
            edgeEffect: new EdgeEffectParameters({
              type: EdgeEffectType.Shadow,
              colour: Colour4.Black.opacity(Math.fround(0.05)),
              radius: 6,
            }),
            colour: this.buttonColour,
            shear: OsuGame.SHEAR,
            children: [
              new Box().with({
                relativeSizeAxes: Axes.Both,
              }),
              new Container().with({
                relativeSizeAxes: Axes.Both,
                masking: true,
                children: [
                  new TrianglesV2().with({
                    relativeSizeAxes: Axes.Both,
                    alpha: Math.fround(0.1),
                    velocity: Math.fround(0.7),
                    blending: BlendingParameters.Additive,
                    shear: OsuGame.SHEAR.neg(),
                    clampAxes: Axes.Y,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      spriteText = new OsuSpriteText().with({
        text: this.text,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        font: OsuFont.getFont({ size: 28, weight: FontWeight.Bold }),
        shadow: true,
        shadowColour: new Colour4(0, 0, 0, Math.fround(0.1)),
        colour: Colour4.White,
      }),
    ];

    this.glowContainer = glowContainer;
    this.leftGlow = leftGlow;
    this.centerGlow = centerGlow;
    this.rightGlow = rightGlow;
    this.colourContainer = colourContainer;
    this.spriteText = spriteText;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.stateChanged.add(s => this.selectionChanged(s));

    this.enabled.bindValueChanged(() => this.updateColour(), true);
  }

  private updateColour(): void {
    // (called by the buttonColour setter before the constructor has assigned the container)
    if (this.colourContainer === undefined)
      return;

    this.colourContainer.colour = this.enabled.value ? this._buttonColour : this._buttonColour.darken(Math.fround(0.8));
    this.updateGlow();
  }

  private clickAnimating = false;

  protected override onClick(e: ClickEvent): boolean {
    if (this.enabled.value) {
      const flash = new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: this.buttonColour,
        blending: BlendingParameters.Additive,
        alpha: Math.fround(0.05),
      });

      this.colourContainer.add(flash);
      flash.fadeOutFromOne(100).expire();

      this.clickAnimating = true;
      this.colourContainer.resizeWidthTo(Math.fround(this.colourContainer.width * Math.fround(1.05)), 100, Easing.OutQuint)
        .onComplete(() => {
          this.clickAnimating = false;
          this.stateChanged.emit(this.state);
        });
    }

    return super.onClick(e);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    this.colourContainer.resizeWidthTo(Math.fround(hover_width * Math.fround(0.98)), click_duration * 4, Easing.OutQuad);
    return super.onMouseDown(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (this.state === SelectionState.Selected)
      this.colourContainer.resizeWidthTo(hover_width, click_duration, Easing.In);
    super.onMouseUp(e);
  }

  protected override onHover(e: HoverEvent): boolean {
    super.onHover(e);
    this.state = SelectionState.Selected;

    return true;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    super.onHoverLost(e);
    this.state = SelectionState.NotSelected;
  }

  private selectionChanged(newState: SelectionState): void {
    if (this.clickAnimating)
      return;

    if (newState === SelectionState.Selected) {
      this.spriteText.transformTo('spacing', this.hoverSpacing, hover_duration, Easing.OutQuint);
      this.spriteText.scaleTo(Math.fround(1.02), hover_duration, Easing.OutQuint);
      this.colourContainer.resizeWidthTo(hover_width, hover_duration, Easing.OutQuint);
      this.glowContainer.resizeWidthTo(Math.fround(hover_width * Math.fround(1.08)), hover_duration, Easing.OutQuint);
      this.glowContainer.fadeIn(hover_duration, Easing.OutQuint);
    } else {
      this.colourContainer.resizeWidthTo(idle_width, hover_duration / 2, Easing.OutQuint);
      this.glowContainer.resizeWidthTo(Math.fround(idle_width * Math.fround(1.08)), hover_duration, Easing.OutQuint);

      this.spriteText.transformTo('spacing', Vector2.Zero, hover_duration / 2, Easing.OutQuint);
      this.spriteText.scaleTo(1, hover_duration / 2, Easing.OutQuint);
      this.glowContainer.fadeOut(hover_duration / 2, Easing.OutQuint);
    }
  }

  private updateGlow(): void {
    const col = this.colourContainer.colour.topLeft;

    this.leftGlow.colour = ColourInfo.gradientHorizontal(col.opacity(0), col);
    this.centerGlow.colour = col;
    this.rightGlow.colour = ColourInfo.gradientHorizontal(col, col.opacity(0));
  }
}
