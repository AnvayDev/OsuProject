// Ported from osu.Game/Screens/Footer/ScreenFooterButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import type { OverlayContainer } from '@fw/graphics/containers/OverlayContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { BlendingParameters, EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { ClickEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuClickableContainer } from '../../graphics/containers/OsuClickableContainer';
import { OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

export class ScreenFooterButton extends OsuClickableContainer implements IKeyBindingHandler<GlobalAction> {
  readonly keyBindingActionTypes = [GlobalAction];

  static readonly CORNER_RADIUS = 10;

  static readonly HEIGHT = 75;
  protected static readonly BUTTON_WIDTH = 116;

  /** If this footer button controls the visibility of an overlay, it will be bound to this bindable. */
  readonly overlayState = new Bindable<Visibility>(Visibility.Hidden);

  /**
   * Used to tell whether this button is currently on screen.
   * ScreenFooter controls this to convey when buttons are hidden temporarily.
   */
  readonly state = new Bindable<Visibility>(Visibility.Visible);

  private colourProvider!: OverlayColourProvider;

  private buttonAccentColour = Colour4.White;

  set accentColour(value: Colour4) {
    this.buttonAccentColour = value;
    this.bar.colour = this.buttonAccentColour;
    this.icon.colour = this.buttonAccentColour;
  }

  set iconUsage(value: IconUsage) {
    this.icon.icon = value;
  }

  get text(): string {
    return this.textSprite.text;
  }

  set text(value: string) {
    this.textSprite.text = value;
  }

  override get action(): (() => void) | null {
    return super.action;
  }

  override set action(value: (() => void) | null) {
    if (value === null)
      super.action = null;
    else {
      super.action = () => {
        if (this.state.value !== Visibility.Hidden)
          value();
      };
    }
  }

  private readonly shearedContent: Container;

  // (C#'s text and icon)
  private readonly textSprite: SpriteText;
  private readonly icon: SpriteIcon;

  protected textContainer: Container;
  private readonly bar: Box;
  private readonly backgroundBox: Box;
  private readonly glowBox: Box;
  private readonly flashLayer: Box;

  readonly overlay: OverlayContainer | null;

  constructor(overlay: OverlayContainer | null = null) {
    super();

    this.overlay = overlay;

    this.size = new Vector2(ScreenFooterButton.BUTTON_WIDTH, ScreenFooterButton.HEIGHT);

    let backgroundBox!: Box, glowBox!: Box, textContainer!: Container, textSprite!: OsuSpriteText, icon!: SpriteIcon, bar!: Box, flashLayer!: Box;

    this.children = [
      this.shearedContent = new Container().with({
        edgeEffect: new EdgeEffectParameters({
          type: EdgeEffectType.Shadow,
          radius: 4,
          // Figma says 50% opacity, but it does not match up visually if taken at face value, and looks bad.
          colour: Colour4.Black.opacity(0.25),
          offset: new Vector2(0, 2),
        }),
        shear: OsuGame.SHEAR,
        masking: true,
        cornerRadius: ScreenFooterButton.CORNER_RADIUS,
        relativeSizeAxes: Axes.Both,
        children: [
          backgroundBox = new Box().with({
            relativeSizeAxes: Axes.Both,
          }),
          glowBox = new Box().with({
            relativeSizeAxes: Axes.Both,
          }),
          // For elements that should not be sheared.
          new Container().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            shear: OsuGame.SHEAR.neg(),
            relativeSizeAxes: Axes.Both,
            children: [
              textContainer = new Container().with({
                anchor: Anchor.TopCentre,
                origin: Anchor.TopCentre,
                y: 35,
                autoSizeAxes: Axes.Both,
                child: textSprite = new OsuSpriteText().with({
                  font: withFont(OsuFont.TorusAlternate, { size: 16 }),
                  alwaysPresent: true,
                }),
              }),
              icon = new SpriteIcon().with({
                y: 10,
                size: new Vector2(16),
                anchor: Anchor.TopCentre,
                origin: Anchor.TopCentre,
              }),
            ],
          }),
          new Container().with({
            shear: OsuGame.SHEAR.neg(),
            anchor: Anchor.BottomCentre,
            origin: Anchor.Centre,
            y: -ScreenFooterButton.CORNER_RADIUS,
            size: new Vector2(100, 5),
            masking: true,
            cornerRadius: 3,
            child: bar = new Box().with({
              relativeSizeAxes: Axes.Both,
            }),
          }),
          flashLayer = new Box().with({
            relativeSizeAxes: Axes.Both,
            colour: Colour4.White.opacity(0.9),
            blending: BlendingParameters.Additive,
            alpha: 0,
          }),
        ],
      }),
    ];

    this.backgroundBox = backgroundBox;
    this.glowBox = glowBox;
    this.textContainer = textContainer;
    this.textSprite = textSprite;
    this.icon = icon;
    this.bar = bar;
    this.flashLayer = flashLayer;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    if (this.overlay !== null)
      this.overlayState.bindTo(this.overlay.state);

    this.overlayState.bindValueChanged(() => this.updateDisplay());
    this.enabled.bindValueChanged(() => this.updateDisplay(), true);

    this.finishTransforms(true);
  }

  // account for shear and buttons temporarily hidden with disappearToBottom.
  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.shearedContent.receivePositionalInputAt(screenSpacePos);
  }

  hotkey: GlobalAction | null = null;

  protected override onClick(e: ClickEvent): boolean {
    if (this.enabled.value)
      this.flash();

    return super.onClick(e);
  }

  protected flash(): void {
    this.flashLayer.fadeOutFromOne(800, Easing.OutQuint);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.updateDisplay();
    return true;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.updateDisplay();
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.action !== this.hotkey || e.repeat) return false;

    this.triggerClick();
    return true;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }

  updateDisplay(): void {
    let backgroundColour = this.overlayState.value === Visibility.Visible ? this.buttonAccentColour : this.colourProvider.background3;
    let textColour = this.overlayState.value === Visibility.Visible ? this.colourProvider.background6 : this.colourProvider.content1;
    const accentColour = this.overlayState.value === Visibility.Visible ? this.colourProvider.background6 : this.buttonAccentColour;

    if (!this.enabled.value)
      backgroundColour = backgroundColour.darken(1);
    else if (this.isHovered)
      backgroundColour = backgroundColour.lighten(0.2);

    this.backgroundBox.fadeColour(backgroundColour, 150, Easing.OutQuint);

    if (!this.enabled.value)
      textColour = textColour.opacity(0.6);

    this.textSprite.fadeColour(textColour, 150, Easing.OutQuint);
    this.icon.fadeColour(accentColour, 150, Easing.OutQuint);
    this.bar.fadeColour(accentColour, 150, Easing.OutQuint);

    this.glowBox.fadeColour(ColourInfo.gradientVertical(this.buttonAccentColour.opacity(0), this.buttonAccentColour.opacity(0.2)), 150, Easing.OutQuint);
  }

  appearFromLeft(delay: number): void {
    this.content.finishTransforms();
    this.content.moveToX(-300)
      .fadeOut()
      .delay(delay)
      .moveToX(0, 240, Easing.OutCubic)
      .fadeIn(240, Easing.OutCubic);
  }

  appearFromBottom(delay: number): void {
    this.content.finishTransforms();
    this.content.moveToY(100)
      .fadeOut()
      .delay(delay)
      .moveToY(0, 240, Easing.OutCubic)
      .fadeIn(240, Easing.OutCubic);
  }

  disappearToRight(delay: number, expire: boolean): void {
    this.content.finishTransforms();
    this.content.delay(delay)
      .fadeOut(240, Easing.InOutCubic)
      .moveToX(300, 360, Easing.InOutCubic);

    if (expire)
      this.delay(this.content.latestTransformEndTime - this.time.current).expire();
  }

  disappearToBottom(delay: number, expire: boolean): void {
    this.content.finishTransforms();
    this.content.delay(delay)
      .fadeOut(240, Easing.InOutCubic)
      .moveToY(100, 240, Easing.InOutCubic);

    if (expire)
      this.delay(this.content.latestTransformEndTime - this.time.current).expire();
  }
}
