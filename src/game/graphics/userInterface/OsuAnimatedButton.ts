// Ported from osu.Game/Graphics/UserInterface/OsuAnimatedButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { BlendingParameters, EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { ClickEvent, HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import { OsuClickableContainer } from '../containers/OsuClickableContainer';
import { OsuColour } from '../OsuColour';
import { HoverSampleSet } from './HoverSampleSet';

/** Highlight on hover, bounce on click. */
export class OsuAnimatedButton extends OsuClickableContainer {
  /** The colour that should be flashed when the OsuAnimatedButton is clicked. (C#'s FlashColour; renamed as Drawable.flashColour() exists.) */
  protected clickFlashColour = Colour4.White.opacity(0.3);

  private _hoverColour = Colour4.White.opacity(0.1);

  protected scaleOnMouseDown = 0.75;

  /** The background colour of the OsuAnimatedButton while it is hovered. */
  protected get hoverColour(): Colour4 {
    return this._hoverColour;
  }

  protected set hoverColour(value: Colour4) {
    this._hoverColour = value;
    this.hover.colour = value;
  }

  // (colours.Gray9, resolved in load)
  private disabledColour = Colour4.White;

  protected override get content(): Container {
    return this.animatedContent;
  }

  /** C#'s private `content`. */
  private readonly animatedContent: Container;
  private readonly hover: Box;

  constructor(sampleSet = HoverSampleSet.Button) {
    super(sampleSet);

    let hover!: Box;
    super.content.add(this.animatedContent = new Container().with({
      origin: Anchor.Centre,
      anchor: Anchor.Centre,
      relativeSizeAxes: Axes.Both,
      cornerRadius: 10,
      cornerExponent: 2.5,
      masking: true,
      edgeEffect: new EdgeEffectParameters({
        colour: Colour4.Black.opacity(0.04),
        type: EdgeEffectType.Shadow,
        radius: 5,
      }),
      children: [
        hover = new Box().with({
          relativeSizeAxes: Axes.Both,
          colour: Colour4.White.opacity(0.1),
          blending: BlendingParameters.Additive,
          alpha: 0,
        }),
      ],
    }));
    this.hover = hover;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.disabledColour = dependencies.resolve(OsuColour).gray9;

    if (this.autoSizeAxes !== Axes.None) {
      this.animatedContent.relativeSizeAxes = (Axes.Both & ~this.autoSizeAxes);
      this.animatedContent.autoSizeAxes = this.autoSizeAxes;
    }

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.enabled.bindValueChanged(() => this.animatedContent.fadeColour(this.dimColour, 200, Easing.OutQuint), true);
    this.finishTransforms(true);
  }

  protected get dimColour(): Colour4 {
    return this.enabled.value ? Colour4.White : this.disabledColour;
  }

  protected override onHover(e: HoverEvent): boolean {
    this.hover.fadeIn(500, Easing.OutQuint);
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.hover.fadeOut(500, Easing.OutQuint);
    super.onHoverLost(e);
  }

  protected override onClick(e: ClickEvent): boolean {
    // Handle case where a click is triggered via triggerClick().
    if (!this.isHovered)
      this.hover.fadeOutFromOne(1600);

    this.hover.flashColour(this.clickFlashColour, 800, Easing.OutQuint);
    return super.onClick(e);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    this.content.scaleTo(this.scaleOnMouseDown, 2000, Easing.OutQuint);
    return super.onMouseDown(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    this.content.scaleTo(1, 1000, Easing.OutElastic);
    super.onMouseUp(e);
  }
}
