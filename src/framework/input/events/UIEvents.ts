// Ported from osu.Framework/Input/Events/*.cs (UI, mouse, keyboard, focus and hover events).

import type { Drawable } from '../../graphics/Drawable';
import { Vector2 } from '../../layout/Vector2';
import type { InputState } from '../InputState';
import type { Key, MouseButton } from '../Key';

/** An event type representing a single input event (e.g. a mouse button down, a key down). */
export abstract class UIEvent {
  /** The current input state. */
  readonly currentState: InputState;

  /** The Drawable which is handling this event (set by Drawable.triggerEvent). */
  target: Drawable | null = null;

  /** Converts a screen space position to the target's parent's local space (as Drawable positions are). */
  protected toLocalSpace(screenSpacePosition: Vector2): Vector2 {
    return this.target?.parent?.toLocalSpace(screenSpacePosition) ?? screenSpacePosition;
  }

  /** The current mouse position in screen space. */
  get screenSpaceMousePosition(): Vector2 {
    return this.currentState.mouse.position;
  }

  /** The current mouse position in the target's parent's space (the same space as the target's position). */
  get mousePosition(): Vector2 {
    return this.toLocalSpace(this.screenSpaceMousePosition);
  }

  get controlPressed(): boolean {
    return this.currentState.keyboard.controlPressed;
  }

  get altPressed(): boolean {
    return this.currentState.keyboard.altPressed;
  }

  get shiftPressed(): boolean {
    return this.currentState.keyboard.shiftPressed;
  }

  get superPressed(): boolean {
    return this.currentState.keyboard.superPressed;
  }

  constructor(state: InputState) {
    this.currentState = state;
  }

  toString(): string {
    return `${this.constructor.name}()`;
  }
}

/** Events of mouse input. */
export abstract class MouseEvent extends UIEvent {
  isPressed(button: MouseButton): boolean {
    return this.currentState.mouse.buttons.isPressed(button);
  }

  get hasAnyButtonPressed(): boolean {
    return this.currentState.mouse.buttons.hasAnyButtonPressed;
  }

  get pressedButtons(): Iterable<MouseButton> {
    return this.currentState.mouse.buttons;
  }
}

/** Events of a mouse button. */
export abstract class MouseButtonEvent extends MouseEvent {
  readonly screenSpaceMouseDownPosition: Vector2;

  /** The mouse position at the time the button was pressed, in the target's parent's space. */
  get mouseDownPosition(): Vector2 {
    return this.toLocalSpace(this.screenSpaceMouseDownPosition);
  }

  constructor(state: InputState, readonly button: MouseButton, screenSpaceMouseDownPosition: Vector2 | null = null) {
    super(state);
    this.screenSpaceMouseDownPosition = screenSpaceMouseDownPosition ?? this.screenSpaceMousePosition;
  }
}

export class MouseDownEvent extends MouseButtonEvent {}
export class MouseUpEvent extends MouseButtonEvent {}
export class ClickEvent extends MouseButtonEvent {}
export class DoubleClickEvent extends MouseButtonEvent {}
export class DragEndEvent extends MouseButtonEvent {}

export class DragStartEvent extends MouseButtonEvent {
  /** The difference of mouse position from the mouse button down position in the target's parent's space. */
  get delta(): Vector2 {
    return this.mousePosition.sub(this.mouseDownPosition);
  }
}

export class DragEvent extends MouseButtonEvent {
  readonly screenSpaceLastMousePosition: Vector2;

  get lastMousePosition(): Vector2 {
    return this.toLocalSpace(this.screenSpaceLastMousePosition);
  }

  /** The difference of the mouse position from the last position in the target's parent's space. */
  get delta(): Vector2 {
    return this.mousePosition.sub(this.lastMousePosition);
  }

  constructor(state: InputState, button: MouseButton, screenSpaceMouseDownPosition: Vector2 | null = null, screenSpaceLastMousePosition: Vector2 | null = null) {
    super(state, button, screenSpaceMouseDownPosition);
    this.screenSpaceLastMousePosition = screenSpaceLastMousePosition ?? state.mouse.position;
  }
}

export class MouseMoveEvent extends MouseEvent {
  readonly screenSpaceLastMousePosition: Vector2;

  get lastMousePosition(): Vector2 {
    return this.toLocalSpace(this.screenSpaceLastMousePosition);
  }

  get delta(): Vector2 {
    return this.mousePosition.sub(this.lastMousePosition);
  }

  constructor(state: InputState, screenSpaceLastMousePosition: Vector2 | null = null) {
    super(state);
    this.screenSpaceLastMousePosition = screenSpaceLastMousePosition ?? this.screenSpaceMousePosition;
  }
}

export class HoverEvent extends MouseEvent {}
export class HoverLostEvent extends MouseEvent {}

export class ScrollEvent extends MouseEvent {
  constructor(state: InputState, readonly scrollDelta: Vector2, readonly isPrecise = false) {
    super(state);
  }

  override toString(): string {
    return `ScrollEvent(${this.scrollDelta}, ${this.isPrecise})`;
  }
}

export class FocusEvent extends UIEvent {
  constructor(state: InputState, readonly previouslyFocused: Drawable | null) {
    super(state);
  }
}

export class FocusLostEvent extends UIEvent {
  constructor(state: InputState, readonly nextFocused: Drawable | null) {
    super(state);
  }
}

/** Events of a keyboard key. */
export abstract class KeyboardEvent extends UIEvent {
  constructor(state: InputState, readonly key: Key) {
    super(state);
  }

  isPressed(key: Key): boolean {
    return this.currentState.keyboard.keys.isPressed(key);
  }

  get hasAnyKeyPressed(): boolean {
    return this.currentState.keyboard.keys.hasAnyButtonPressed;
  }

  get pressedKeys(): Iterable<Key> {
    return this.currentState.keyboard.keys;
  }
}

export class KeyDownEvent extends KeyboardEvent {
  constructor(state: InputState, key: Key, readonly repeat = false) {
    super(state, key);
  }
}

export class KeyUpEvent extends KeyboardEvent {}
