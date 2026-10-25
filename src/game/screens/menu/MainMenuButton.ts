// Ported from osu.Game/Screens/Menu/MainMenuButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import type { SampleChannel } from '@fw/audio/sample/SampleChannel';
import type { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import { Signal } from '@fw/bindables/Signal';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { BlendingParameters, EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { ClickEvent, HoverEvent, HoverLostEvent, KeyDownEvent, MouseDownEvent, MouseUpEvent, UIEvent } from '@fw/input/events/UIEvents';
import type { Key } from '@fw/input/Key';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { EffectControlPoint } from '../../beatmaps/controlPoints/EffectControlPoint';
import type { TimingControlPoint } from '../../beatmaps/controlPoints/TimingControlPoint';
import { BeatSyncedContainer } from '../../graphics/containers/BeatSyncedContainer';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { ButtonArea } from './ButtonArea';
import { ButtonSystem, ButtonSystemState } from './ButtonSystem';

// C# float.MinValue
const float_min_value = -3.4028234663852886e38;

export enum ButtonState {
  Contracted,
  Expanded,
  Exploded,
}

/**
 * Button designed specifically for the osu!next main menu.
 * In order to correctly flow, we have to use a negative margin on the parent container (due to the parallelogram shape).
 */
export class MainMenuButton extends BeatSyncedContainer {
  static readonly BOUNCE_COMPRESSION = Math.fround(0.9);
  static readonly HOVER_SCALE = Math.fround(1.2);
  static readonly BOUNCE_ROTATION = 8;

  readonly stateChanged = new Signal<ButtonState>();

  readonly triggerKeys: Key[];

  protected override get content(): Container {
    return this.buttonContent;
  }

  /** C#'s private `content` (the `content` accessor above is Container.Content). */
  private readonly buttonContent: Container;

  /** The menu state for which we are visible for (assuming only one). */
  set visibleState(value: ButtonSystemState) {
    this.visibleStateMin = value;
    this.visibleStateMax = value;
  }

  visibleStateMin = ButtonSystemState.TopLevel;
  visibleStateMax = ButtonSystemState.TopLevel;

  /** C#'s `new Padding` (the content's padding). Renamed: CompositeDrawable reads `padding` for its own layout, so it can't be overridden. */
  get buttonPadding(): MarginPadding {
    return this.content.padding;
  }

  set buttonPadding(value: MarginPadding) {
    this.content.padding = value;
  }

  /** C#'s BaseSize (CompositeDrawable has its own private baseSize, the auto-size target). */
  protected buttonBaseSize = new Vector2(ButtonSystem.BUTTON_WIDTH, ButtonArea.BUTTON_AREA_HEIGHT);

  private readonly clickAction: ((button: MainMenuButton, e: UIEvent) => void) | null;

  private readonly background: Container;
  private readonly backgroundContent: Drawable;
  private readonly boxHoverLayer: Box;
  private readonly icon: SpriteIcon;

  private get initialSize(): Vector2 {
    return this.buttonBaseSize.add(this.buttonPadding.total);
  }

  private readonly sampleName: string;
  private sampleClick: Sample | null = null;
  private sampleHover: Sample | null = null;
  private sampleChannel: SampleChannel | null = null;

  override get isPresent(): boolean {
    return super.isPresent
      // Allow keyboard interaction based on state rather than waiting for delayed animations.
      || this.state === ButtonState.Expanded;
  }

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.background.receivePositionalInputAt(screenSpacePos);
  }

  constructor(text: string, sampleName: string, symbol: IconUsage, colour: Colour4,
    clickAction: ((button: MainMenuButton, e: UIEvent) => void) | null = null, ...triggerKeys: Key[]) {
    super();

    this.sampleName = sampleName;
    this.clickAction = clickAction;
    this.triggerKeys = triggerKeys;

    this.autoSizeAxes = Axes.Both;
    this.alpha = 0;

    let backgroundContent!: Drawable;
    let boxHoverLayer!: Box;
    let icon!: SpriteIcon;

    this.addRangeInternal([
      this.background = new Container().with({
        // box needs to be always present to ensure the button is always sized correctly for flow
        alwaysPresent: true,
        masking: true,
        maskingSmoothness: 2,
        edgeEffect: new EdgeEffectParameters({
          type: EdgeEffectType.Shadow,
          colour: Colour4.Black.opacity(0.2),
          roundness: 5,
          radius: 8,
        }),
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        children: [
          backgroundContent = this.createBackground(colour).with({
            relativeSizeAxes: Axes.Y,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
          }),
          boxHoverLayer = new Box().with({
            edgeSmoothness: new Vector2(1.5, 0),
            relativeSizeAxes: Axes.Both,
            blending: BlendingParameters.Additive,
            colour: Colour4.White,
            depth: float_min_value,
            alpha: 0,
          }),
        ],
      }),
      this.buttonContent = new Container().with({
        relativeSizeAxes: Axes.Both,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        children: [
          new OsuSpriteText().with({
            shadow: true,
            allowMultiline: false,
            anchor: Anchor.BottomCentre,
            origin: Anchor.BottomCentre,
            margin: MarginPadding.of({
              left: -3,
              bottom: 7,
            }),
            text,
          }),
          icon = new SpriteIcon().with({
            shadow: true,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            size: new Vector2(32),
            position: new Vector2(0, 0),
            margin: MarginPadding.of({ top: -4 }),
            icon: symbol,
          }),
        ],
      }),
    ]);

    this.backgroundContent = backgroundContent;
    this.boxHoverLayer = boxHoverLayer;
    this.icon = icon;
  }

  protected createBackground(accentColour: Colour4): Drawable {
    return new Container().with({
      child: new Box().with({
        edgeSmoothness: new Vector2(1.5, 0),
        relativeSizeAxes: Axes.Both,
        colour: accentColour,
      }),
    });
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.background.shear = new Vector2(Math.fround(ButtonSystem.WEDGE_WIDTH / this.initialSize.y), 0);

    // for whatever reason, attempting to size the background "just in time" to cover the visible width
    // results in gaps when the width changes are quick (only visible when testing menu at 100% speed, not visible slowed down).
    // to ensure there's no missing backdrop, just use a ballpark that should be enough to always cover the width and then some.
    // note that while on a code inspections it would seem that `1.5 * initialSize.X` would be enough, elastic usings are used in this button
    // (which can exceed the [0;1] range during interpolation).
    this.backgroundContent.width = 2 * this.initialSize.x;
    this.backgroundContent.shear = this.background.shear.mul(-1);

    this.animateState();
    this.finishTransforms(true);
  }

  private rightward = false;

  protected override onNewBeat(beatIndex: number, timingPoint: TimingControlPoint, effectPoint: EffectControlPoint, amplitudes: ChannelAmplitudes): void {
    super.onNewBeat(beatIndex, timingPoint, effectPoint, amplitudes);

    if (!this.isHovered) return;

    const duration = timingPoint.beatLength / 2;

    this.icon.rotateTo(this.rightward ? MainMenuButton.BOUNCE_ROTATION : -MainMenuButton.BOUNCE_ROTATION, duration * 2, Easing.InOutSine);

    this.icon.animate(
      i => i.moveToY(-10, duration, Easing.Out),
      i => i.scaleTo(MainMenuButton.HOVER_SCALE, duration, Easing.Out),
    ).then(
      i => i.moveToY(0, duration, Easing.In),
      i => i.scaleTo(new Vector2(MainMenuButton.HOVER_SCALE, Math.fround(MainMenuButton.HOVER_SCALE * MainMenuButton.BOUNCE_COMPRESSION)), duration, Easing.In),
    );

    this.rightward = !this.rightward;
  }

  protected override onHover(_e: HoverEvent): boolean {
    if (this.state !== ButtonState.Expanded) return true;

    const duration = this.timeUntilNextBeat;

    this.icon.clearTransforms();
    this.icon.rotateTo(this.rightward ? -MainMenuButton.BOUNCE_ROTATION : MainMenuButton.BOUNCE_ROTATION, duration, Easing.InOutSine);
    this.icon.scaleTo(new Vector2(MainMenuButton.HOVER_SCALE, Math.fround(MainMenuButton.HOVER_SCALE * MainMenuButton.BOUNCE_COMPRESSION)), duration, Easing.Out);

    this.sampleHover?.play();
    this.background.resizeTo(this.initialSize.mul(new Vector2(1.5, 1)), 500, Easing.OutElastic);

    return true;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.icon.clearTransforms();
    this.icon.rotateTo(0, 500, Easing.Out);
    this.icon.moveTo(Vector2.Zero, 500, Easing.Out);
    this.icon.scaleTo(Vector2.One, 200, Easing.Out);

    if (this.state === ButtonState.Expanded)
      this.background.resizeTo(this.initialSize, 500, Easing.OutElastic);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const samples = dependencies.resolve(AudioManager).samples;

    [this.sampleHover, this.sampleClick] = await Promise.all([
      samples.get('Menu/button-hover'),
      samples.get(this.sampleName !== '' ? `Menu/${this.sampleName}` : 'UI/button-select'),
    ]);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    this.boxHoverLayer.fadeTo(Math.fround(0.1), 1000, Easing.OutQuint);
    return super.onMouseDown(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    this.boxHoverLayer.fadeTo(0, 1000, Easing.OutQuint);
    super.onMouseUp(e);
  }

  protected override onClick(e: ClickEvent): boolean {
    this.trigger(e);
    return true;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (e.repeat || e.controlPressed || e.shiftPressed || e.altPressed || e.superPressed)
      return false;

    if (this.triggerKeys.includes(e.key)) {
      this.trigger(e);
      return true;
    }

    return false;
  }

  private trigger(e: UIEvent): void {
    this.sampleChannel = this.sampleClick?.getChannel() ?? null;
    this.sampleChannel?.play();

    this.clickAction?.(this, e);

    this.boxHoverLayer.clearTransforms();
    this.boxHoverLayer.alpha = Math.fround(0.9);
    this.boxHoverLayer.fadeOut(800, Easing.OutExpo);
  }

  override get handleNonPositionalInput(): boolean {
    return this.state === ButtonState.Expanded;
  }

  override get handlePositionalInput(): boolean {
    return this.state !== ButtonState.Exploded && Math.fround(this.background.width / this.initialSize.x) >= Math.fround(0.8);
  }

  stopSamplePlayback(): void {
    this.sampleChannel?.stop();
  }

  protected override update(): void {
    this.buttonContent.alpha = Math.min(Math.max(Math.fround((Math.fround(this.background.width / this.initialSize.x) - Math.fround(0.5)) / Math.fround(0.3)), 0), 1);
    super.update();
  }

  contractStyle = 0;

  private _state = ButtonState.Contracted;

  get state(): ButtonState {
    return this._state;
  }

  set state(value: ButtonState) {
    if (this._state === value)
      return;

    this._state = value;

    this.animateState();

    this.stateChanged.emit(this.state);
  }

  private animateState(): void {
    switch (this._state) {
      case ButtonState.Contracted:
        switch (this.contractStyle) {
          default:
            this.background.resizeTo(this.initialSize.mul(new Vector2(0, 1)), 500, Easing.OutExpo);
            this.fadeOut(500);
            break;

          case 1:
            this.background.resizeTo(this.initialSize.mul(new Vector2(0, 1)), 400, Easing.InSine);
            this.fadeOut(800);
            break;
        }

        break;

      case ButtonState.Expanded: {
        const expand_duration = 500;
        this.background.resizeTo(this.initialSize, expand_duration, Easing.OutExpo);
        this.fadeIn(Math.fround(expand_duration / 6));
        break;
      }

      case ButtonState.Exploded: {
        const explode_duration = 200;
        this.background.resizeTo(this.initialSize.mul(new Vector2(2, 1)), explode_duration, Easing.OutExpo);
        this.fadeOut(explode_duration / 4 * 3);
        break;
      }
    }
  }

  private _buttonSystemState = ButtonSystemState.Exit;

  get buttonSystemState(): ButtonSystemState {
    return this._buttonSystemState;
  }

  set buttonSystemState(value: ButtonSystemState) {
    if (this._buttonSystemState === value)
      return;

    this._buttonSystemState = value;
    this.updateState();
  }

  protected updateState(): void {
    this.contractStyle = 0;

    switch (this.buttonSystemState) {
      case ButtonSystemState.Initial:
        this.state = ButtonState.Contracted;
        break;

      case ButtonSystemState.EnteringMode:
        this.contractStyle = 1;
        this.state = ButtonState.Contracted;
        break;

      default:
        if (this.buttonSystemState <= this.visibleStateMax && this.buttonSystemState >= this.visibleStateMin)
          this.state = ButtonState.Expanded;
        else if (this.buttonSystemState < this.visibleStateMin)
          this.state = ButtonState.Contracted;
        else
          this.state = ButtonState.Exploded;
        break;
    }
  }
}
