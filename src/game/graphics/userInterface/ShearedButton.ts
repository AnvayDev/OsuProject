// Ported from osu.Game/Graphics/UserInterface/ShearedButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { ClickEvent, HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Easing } from '@fw/transforms/Easing';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuClickableContainer } from '../containers/OsuClickableContainer';
import { OsuFont, withFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { HoverClickSounds } from './HoverClickSounds';
import type { HoverSampleSet } from './HoverSampleSet';
import type { HoverSounds } from './HoverSounds';

export class ShearedButton extends OsuClickableContainer {
  static readonly DEFAULT_HEIGHT = 50;
  static readonly CORNER_RADIUS = 7;
  static readonly BORDER_THICKNESS = 2;

  get text(): string {
    return this.textSprite.text;
  }

  set text(value: string) {
    this.textSprite.text = value;
  }

  get textSize(): number {
    return this.textSprite.font.size;
  }

  set textSize(value: number) {
    this.textSprite.font = withFont(OsuFont.TorusAlternate, { size: value });
  }

  set darkerColour(value: Colour4) {
    this._darkerColour = value;
    this.scheduler.addOnce(this.updateState);
  }

  set lighterColour(value: Colour4) {
    this._lighterColour = value;
    this.scheduler.addOnce(this.updateState);
  }

  set textColour(value: Colour4) {
    this._textColour = value;
    this.scheduler.addOnce(this.updateState);
  }

  protected colourProvider!: OverlayColourProvider;

  private readonly background: Box;
  // (C#'s text; the public `text` accessor is its Text)
  private readonly textSprite: OsuSpriteText;

  private _darkerColour: Colour4 | null = null;
  private _lighterColour: Colour4 | null = null;
  private _textColour: Colour4 | null = null;

  private readonly backgroundLayer: Container;
  private readonly flashLayer: Box;

  protected readonly buttonContent: Container;

  /**
   * Creates a new ShearedButton.
   * By default, the button will have a height of DEFAULT_HEIGHT. Width should be set for each usage.
   */
  constructor() {
    super();

    this.height = ShearedButton.DEFAULT_HEIGHT;

    this.shear = OsuGame.SHEAR;

    this.content.anchor = this.content.origin = Anchor.Centre;
    this.content.cornerRadius = ShearedButton.CORNER_RADIUS;
    this.content.masking = true;

    let background!: Box;
    let textSprite!: OsuSpriteText;

    this.children = [
      this.backgroundLayer = new Container().with({
        relativeSizeAxes: Axes.Both,
        cornerRadius: ShearedButton.CORNER_RADIUS,
        masking: true,
        borderThickness: ShearedButton.BORDER_THICKNESS,
        child: background = new Box().with({
          relativeSizeAxes: Axes.Both,
        }),
      }),
      this.buttonContent = new Container().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        autoSizeAxes: Axes.Both,
        shear: OsuGame.SHEAR.neg(),
        child: textSprite = new OsuSpriteText().with({
          font: withFont(OsuFont.TorusAlternate, { size: 17 }),
          margin: MarginPadding.of({ horizontal: 15 }),
        }),
      }),
      this.flashLayer = new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: Colour4.White.opacity(0.9),
        blending: BlendingParameters.Additive,
        alpha: 0,
      }),
    ];

    this.background = background;
    this.textSprite = textSprite;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    return r;
  }

  protected override createHoverSounds(sampleSet: HoverSampleSet): HoverSounds {
    const sounds = new HoverClickSounds(sampleSet);
    sounds.enabled.bindTarget = this.enabled;
    return sounds;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.enabled.bindValueChanged(() => this.scheduler.addOnce(this.updateState));

    this.updateState();
    this.finishTransforms(true);
  }

  protected override onClick(e: ClickEvent): boolean {
    if (this.enabled.value)
      this.flashLayer.fadeOutFromOne(800, Easing.OutQuint);

    return super.onClick(e);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.scheduler.addOnce(this.updateState);
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.scheduler.addOnce(this.updateState);
    super.onHoverLost(e);
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    this.content.scaleTo(0.9, 2000, Easing.OutQuint);
    return true;
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    this.content.scaleTo(1, 1000, Easing.OutElastic);
    super.onMouseUp(e);
  }

  // (a field so that Scheduler.AddOnce sees the same delegate each time)
  private readonly updateState = (): void => {
    let colourDark = this._darkerColour ?? this.colourProvider.background3;
    let colourLight = this._lighterColour ?? this.colourProvider.background1;
    let colourContent = this._textColour ?? this.colourProvider.content1;

    if (!this.enabled.value) {
      colourDark = colourDark.darken(1);
      colourLight = colourLight.darken(1);
    } else if (this.isHovered) {
      colourDark = colourDark.lighten(0.2);
      colourLight = colourLight.lighten(0.2);
    }

    this.background.fadeColour(colourDark, 150, Easing.OutQuint);
    this.backgroundLayer.transformTo('borderColour', ColourInfo.gradientVertical(colourDark, colourLight), 150, Easing.OutQuint);

    if (!this.enabled.value)
      colourContent = colourContent.opacity(0.6);

    this.buttonContent.fadeColour(colourContent, 150, Easing.OutQuint);
  };
}
