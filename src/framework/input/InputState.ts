// Ported from osu.Framework/Input/States/ButtonStates.cs, MouseState.cs, KeyboardState.cs, InputState.cs
// (touch/joystick/midi/tablet states are omitted: the web port has no such inputs).

import { Vector2 } from '../layout/Vector2';
import { Key, MouseButton } from './Key';
import type { IInput } from './StateChanges';

export interface ButtonStateDifference<TButton> {
  readonly released: readonly TButton[];
  readonly pressed: readonly TButton[];
}

export class ButtonStates<TButton> implements Iterable<TButton> {
  private pressedButtons = new Set<TButton>();

  clone(): ButtonStates<TButton> {
    const clone = new ButtonStates<TButton>();
    clone.pressedButtons = new Set(this.pressedButtons);
    return clone;
  }

  isPressed(button: TButton): boolean {
    return this.pressedButtons.has(button);
  }

  /** Sets the state of a button. Returns whether the state changed. */
  setPressed(button: TButton, pressed: boolean): boolean {
    if (this.pressedButtons.has(button) === pressed)
      return false;

    if (pressed)
      this.pressedButtons.add(button);
    else
      this.pressedButtons.delete(button);

    return true;
  }

  get hasAnyButtonPressed(): boolean {
    return this.pressedButtons.size > 0;
  }

  /** Enumerates the differences between ourselves and a previous ButtonStates. */
  enumerateDifference(lastButtons: ButtonStates<TButton>): ButtonStateDifference<TButton> {
    const released: TButton[] = [];
    const pressed: TButton[] = [];

    for (const b of this.pressedButtons) {
      if (!lastButtons.pressedButtons.has(b))
        pressed.push(b);
    }

    for (const b of lastButtons.pressedButtons) {
      if (!this.pressedButtons.has(b))
        released.push(b);
    }

    return { released, pressed };
  }

  /** Copies the state of another ButtonStates to ourselves. */
  set(other: ButtonStates<TButton>): void {
    this.pressedButtons = new Set(other.pressedButtons);
  }

  [Symbol.iterator](): Iterator<TButton> {
    return this.pressedButtons[Symbol.iterator]();
  }
}

export class MouseState {
  readonly buttons = new ButtonStates<MouseButton>();

  /** The current scroll value (accumulated). */
  scroll = Vector2.Zero;

  /** The current position of the mouse (in screen space). */
  position = Vector2.Zero;

  /** Whether position is valid (e.g. the cursor has entered the window at least once). */
  isPositionValid = true;

  /** The last input applied to the mouse state. */
  lastSource: IInput | null = null;

  isPressed(button: MouseButton): boolean {
    return this.buttons.isPressed(button);
  }

  setPressed(button: MouseButton, pressed: boolean): void {
    this.buttons.setPressed(button, pressed);
  }
}

export class KeyboardState {
  readonly keys = new ButtonStates<Key>();

  get controlPressed(): boolean {
    return this.keys.isPressed(Key.LControl) || this.keys.isPressed(Key.RControl);
  }

  get altPressed(): boolean {
    return this.keys.isPressed(Key.LAlt) || this.keys.isPressed(Key.RAlt);
  }

  get shiftPressed(): boolean {
    return this.keys.isPressed(Key.LShift) || this.keys.isPressed(Key.RShift);
  }

  /** Win key on Windows, or Command key on Mac. */
  get superPressed(): boolean {
    return this.keys.isPressed(Key.LWin) || this.keys.isPressed(Key.RWin);
  }
}

export class InputState {
  constructor(readonly mouse: MouseState = new MouseState(), readonly keyboard: KeyboardState = new KeyboardState()) {}
}
