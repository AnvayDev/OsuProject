// Ported from osu.Framework/Input/StateChanges/* (IInput, ButtonInput, MouseButtonInput, KeyboardKeyInput,
// MousePositionAbsoluteInput, MouseScrollRelativeInput, ButtonStateChangeKind) and StateChanges/Events/*.

import { Vector2 } from '../layout/Vector2';
import type { ButtonStates, InputState } from './InputState';
import type { Key, MouseButton } from './Key';

export enum ButtonStateChangeKind {
  Pressed,
  Released,
}

/** An object which can handle InputState changes. */
export interface IInputStateChangeHandler {
  handleInputStateChange(inputStateChange: InputStateChangeEvent): void;
}

/** Denotes an input from an InputHandler. */
export interface IInput {
  /** Applies a change of the state to the InputState, reporting the change to the handler. */
  apply(state: InputState, handler: IInputStateChangeHandler): void;
}

export class InputStateChangeEvent {
  constructor(readonly state: InputState, readonly input: IInput | null) {}
}

export class ButtonStateChangeEvent<TButton> extends InputStateChangeEvent {
  constructor(state: InputState, input: IInput | null, readonly button: TButton, readonly kind: ButtonStateChangeKind) {
    super(state, input);
  }
}

export class MousePositionChangeEvent extends InputStateChangeEvent {
  constructor(state: InputState, input: IInput | null, readonly lastPosition: Vector2) {
    super(state, input);
  }
}

export class MouseScrollChangeEvent extends InputStateChangeEvent {
  constructor(state: InputState, input: IInput | null, readonly lastScroll: Vector2, readonly isPrecise: boolean) {
    super(state, input);
  }
}

export interface ButtonInputEntry<TButton> {
  readonly button: TButton;
  readonly isPressed: boolean;
}

export abstract class ButtonInput<TButton> implements IInput {
  readonly entries: readonly ButtonInputEntry<TButton>[];

  /** (button, isPressed), a list of entries, or (current, previous) states whose difference is applied. */
  constructor(a: TButton | readonly ButtonInputEntry<TButton>[] | ButtonStates<TButton>, b?: boolean | ButtonStates<TButton>) {
    if (Array.isArray(a)) {
      this.entries = a;
    } else if (typeof b === 'boolean') {
      this.entries = [{ button: a as TButton, isPressed: b }];
    } else {
      const difference = (a as ButtonStates<TButton>).enumerateDifference(b as ButtonStates<TButton>);
      this.entries = [
        ...difference.released.map(button => ({ button, isPressed: false })),
        ...difference.pressed.map(button => ({ button, isPressed: true })),
      ];
    }
  }

  protected abstract getButtonStates(state: InputState): ButtonStates<TButton>;

  protected createEvent(state: InputState, button: TButton, kind: ButtonStateChangeKind): ButtonStateChangeEvent<TButton> {
    return new ButtonStateChangeEvent(state, this, button, kind);
  }

  apply(state: InputState, handler: IInputStateChangeHandler): void {
    if (this.entries.length === 0)
      return;

    const buttonStates = this.getButtonStates(state);

    for (const entry of this.entries) {
      if (buttonStates.setPressed(entry.button, entry.isPressed)) {
        const buttonStateChange = this.createEvent(state, entry.button, entry.isPressed ? ButtonStateChangeKind.Pressed : ButtonStateChangeKind.Released);
        handler.handleInputStateChange(buttonStateChange);
      }
    }
  }
}

export class MouseButtonInput extends ButtonInput<MouseButton> {
  protected getButtonStates(state: InputState): ButtonStates<MouseButton> {
    return state.mouse.buttons;
  }

  override apply(state: InputState, handler: IInputStateChangeHandler): void {
    state.mouse.lastSource = this;
    super.apply(state, handler);
  }
}

export class KeyboardKeyInput extends ButtonInput<Key> {
  protected getButtonStates(state: InputState): ButtonStates<Key> {
    return state.keyboard.keys;
  }
}

/** Denotes an absolute change of mouse position. */
export class MousePositionAbsoluteInput implements IInput {
  constructor(public position: Vector2) {}

  apply(state: InputState, handler: IInputStateChangeHandler): void {
    const mouse = state.mouse;

    if (!mouse.isPositionValid || !mouse.position.equals(this.position)) {
      const lastPosition = mouse.isPositionValid ? mouse.position : this.position;
      mouse.isPositionValid = true;
      mouse.lastSource = this;
      mouse.position = this.position;
      handler.handleInputStateChange(new MousePositionChangeEvent(state, this, lastPosition));
    }
  }
}

/** Denotes a relative change of mouse scroll. Pointing devices such as mice provide relative scroll input. */
export class MouseScrollRelativeInput implements IInput {
  constructor(public delta: Vector2, public isPrecise = false) {}

  apply(state: InputState, handler: IInputStateChangeHandler): void {
    const mouse = state.mouse;

    if (!this.delta.equals(Vector2.Zero)) {
      if (!this.isPrecise && this.delta.x === 0 && state.keyboard.shiftPressed)
        this.delta = new Vector2(this.delta.y, 0);

      const lastScroll = mouse.scroll;
      mouse.scroll = mouse.scroll.add(this.delta);
      mouse.lastSource = this;
      handler.handleInputStateChange(new MouseScrollChangeEvent(state, this, lastScroll, this.isPrecise));
    }
  }
}
