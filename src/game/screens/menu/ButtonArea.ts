// Ported from osu.Game/Screens/Menu/ButtonArea.cs

import { Signal } from '@fw/bindables/Signal';
import { Container } from '@fw/graphics/containers/Container';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../graphics/OsuColour';
import { ButtonSystem, ButtonSystemState } from './ButtonSystem';
import { FlowContainerWithOrigin } from './FlowContainerWithOrigin';

enum ButtonAreaBackgroundState {
  Normal,
  Flat,
}

class ButtonAreaBackground extends Box {
  private _state = ButtonAreaBackgroundState.Normal;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;
    this.size = new Vector2(2, 1);
    this.colour = OsuColour.grayByte(50);
    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;
  }

  get state(): ButtonAreaBackgroundState {
    return this._state;
  }

  set state(value: ButtonAreaBackgroundState) {
    if (value === this._state) return;

    this._state = value;

    switch (this._state) {
      case ButtonAreaBackgroundState.Flat:
        this.scaleTo(new Vector2(2, 0), 300, Easing.InSine);
        break;

      case ButtonAreaBackgroundState.Normal:
        this.scaleTo(Vector2.One, 400, Easing.OutQuint);
        break;
    }

    this.stateChanged.emit(this._state);
  }

  set buttonSystemState(value: ButtonSystemState) {
    switch (value) {
      default:
        this.state = ButtonAreaBackgroundState.Normal;
        break;

      case ButtonSystemState.Initial:
      case ButtonSystemState.Exit:
      case ButtonSystemState.EnteringMode:
        this.state = ButtonAreaBackgroundState.Flat;
        break;
    }
  }

  readonly stateChanged = new Signal<ButtonAreaBackgroundState>();
}

export class ButtonArea extends Container {
  readonly flow: FlowContainerWithOrigin;

  protected override get content(): Container {
    return this.flow;
  }

  private readonly buttonAreaBackground: ButtonAreaBackground;
  private _state = Visibility.Hidden;

  static readonly BUTTON_AREA_HEIGHT = 100;

  constructor() {
    super();

    let buttonAreaBackground!: ButtonAreaBackground;
    let flow!: FlowContainerWithOrigin;

    this.relativeSizeAxes = Axes.Both;
    this.internalChild = new Container().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      relativeSizeAxes: Axes.X,
      size: new Vector2(1, ButtonArea.BUTTON_AREA_HEIGHT),
      alpha: 0,
      alwaysPresent: true, // Always needs to be present for correct tracking on initial -> toplevel state change
      children: [
        buttonAreaBackground = new ButtonAreaBackground(),
        flow = new FlowContainerWithOrigin().with({
          direction: FillDirection.Horizontal,
          spacing: new Vector2(-ButtonSystem.WEDGE_WIDTH, 0),
          anchor: Anchor.Centre,
          autoSizeAxes: Axes.Both,
        }),
      ],
    });

    this.buttonAreaBackground = buttonAreaBackground;
    this.flow = flow;
  }

  set buttonSystemState(value: ButtonSystemState) {
    switch (value) {
      case ButtonSystemState.Exit:
      case ButtonSystemState.Initial:
      case ButtonSystemState.EnteringMode:
        this.hide();
        break;

      case ButtonSystemState.TopLevel:
      case ButtonSystemState.Play:
        this.show();
        break;
    }

    this.buttonAreaBackground.buttonSystemState = value;
  }

  get state(): Visibility {
    return this._state;
  }

  set state(value: Visibility) {
    if (value === this._state) return;

    this._state = value;
    this.internalChild.fadeTo(this._state === Visibility.Hidden ? 0 : 1, 300);
    this.stateChanged.emit(this._state);
  }

  override hide(): void {
    this.state = Visibility.Hidden;
  }

  override show(): void {
    this.state = Visibility.Visible;
  }

  readonly stateChanged = new Signal<Visibility>();
}
