// Ported from osu.Game/Graphics/UserInterface/OsuButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { Button } from '@fw/graphics/userInterface/Button';
import type { ClickEvent, HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import type { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../OsuColour';
import { FontWeight, OsuFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { HoverClickSounds } from './HoverClickSounds';
import { HoverSampleSet } from './HoverSampleSet';

// C# float.MaxValue / float.MinValue
const float_max_value = 3.4028234663852886e38;
const float_min_value = -3.4028234663852886e38;

/** A button with added default sound effects. */
export abstract class OsuButton extends Button {
  get text(): string {
    return this.spriteText.text;
  }

  set text(value: string) {
    this.spriteText.text = value;
  }

  private _backgroundColour: Colour4 | null = null;

  /** Sets a custom background colour to this button, replacing the provided default. */
  get backgroundColour(): Colour4 {
    return this._backgroundColour ?? this._defaultBackgroundColour;
  }

  set backgroundColour(value: Colour4) {
    this._backgroundColour = value;
    this.background.fadeColour(value);
  }

  private _defaultBackgroundColour = Colour4.White;

  /** Sets a default background colour to this button. */
  protected get defaultBackgroundColour(): Colour4 {
    return this._defaultBackgroundColour;
  }

  protected set defaultBackgroundColour(value: Colour4) {
    this._defaultBackgroundColour = value;

    if (this._backgroundColour === null)
      this.background.fadeColour(value);
  }

  private readonly buttonContent: Container;

  protected override get content(): Container {
    return this.buttonContent;
  }

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    // base call is checked for cases when `OsuClickableContainer` has masking applied to it directly (ie. externally in object initialisation).
    return super.receivePositionalInputAt(screenSpacePos)
      // Implementations often apply masking / edge rounding at a content level, so it's imperative to check that as well.
      && this.content.receivePositionalInputAt(screenSpacePos);
  }

  protected hover: Box;
  protected background: Box;
  protected spriteText: SpriteText;

  private readonly flashLayer: Box;

  protected constructor(hoverSounds: HoverSampleSet | null = HoverSampleSet.Button) {
    super();

    this.height = 40;

    let hover!: Box, background!: Box, spriteText!: SpriteText, flashLayer!: Box;

    this.addInternal(this.buttonContent = new Container().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      masking: true,
      cornerRadius: 5,
      relativeSizeAxes: Axes.Both,
      children: [
        background = new Box().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          relativeSizeAxes: Axes.Both,
          depth: float_max_value,
        }),
        hover = new Box().with({
          alpha: 0,
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          relativeSizeAxes: Axes.Both,
          colour: Colour4.White,
          blending: BlendingParameters.Additive,
          depth: float_min_value,
        }),
        spriteText = this.createText(),
        flashLayer = new Box().with({
          relativeSizeAxes: Axes.Both,
          blending: BlendingParameters.Additive,
          depth: float_min_value,
          colour: Colour4.White.opacity(0.5),
          alpha: 0,
        }),
      ],
    }));

    this.hover = hover;
    this.background = background;
    this.spriteText = spriteText;
    this.flashLayer = flashLayer;

    if (hoverSounds !== null) {
      const sounds = new HoverClickSounds(hoverSounds);
      sounds.enabled.bindTarget = this.enabled;
      this.addInternal(sounds);
    }
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.defaultBackgroundColour = dependencies.resolve(OsuColour).blueDark;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.colour = this.dimColour;
    this.enabled.bindValueChanged(() => this.fadeColour(this.dimColour, 200, Easing.OutQuint));
  }

  private get dimColour(): Colour4 {
    return this.enabled.value ? Colour4.White : Colour4.Gray;
  }

  protected override onClick(e: ClickEvent): boolean {
    if (this.enabled.value)
      this.flashLayer.fadeOutFromOne(500, Easing.OutQuint);

    return super.onClick(e);
  }

  protected get hoverLayerFinalAlpha(): number {
    return Math.fround(0.1);
  }

  protected override onHover(e: HoverEvent): boolean {
    if (this.enabled.value) {
      this.hover.fadeTo(Math.fround(0.2), 40, Easing.OutQuint)
        .then()
        .fadeTo(this.hoverLayerFinalAlpha, 800, Easing.OutQuint);
    }

    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    super.onHoverLost(e);

    this.hover.fadeOut(800, Easing.OutQuint);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    this.content.scaleTo(Math.fround(0.9), 4000, Easing.OutQuint);
    return super.onMouseDown(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    this.content.scaleTo(1, 1000, Easing.OutElastic);
    super.onMouseUp(e);
  }

  protected createText(): SpriteText {
    return new OsuSpriteText().with({
      depth: -1,
      origin: Anchor.Centre,
      anchor: Anchor.Centre,
      font: OsuFont.getFont({ weight: FontWeight.Bold }),
    });
  }
}
