// Ported from osu.Framework/Input/Bindings/InputKey.cs (keyboard/mouse/media subset), KeyCombination.cs, KeyBinding.cs,
// IKeyBindingHandler.cs, KeyBindingContainer.cs, Extensions/InputKeyExtensions.cs and Input/Events/KeyBinding*Event.cs.
//
// C# dispatches IKeyBindingHandler<T> by generic type. TS has no runtime generics, so a KeyBindingContainer is constructed with
// an `actionType` token (the action enum object) and handlers declare the action types they handle in `keyBindingActionTypes`.

import { Container } from '../../graphics/containers/Container';
import type { Drawable } from '../../graphics/Drawable';
import { Axes } from '../../layout/Enums';
import type { Vector2 } from '../../layout/Vector2';
import { isRootedAt } from '../ButtonEventManagers';
import { KeyDownEvent, KeyUpEvent, MouseDownEvent, MouseUpEvent, ScrollEvent, UIEvent } from '../events/UIEvents';
import { InputManager } from '../InputManager';
import { InputState } from '../InputState';
import { Key, type MouseButton } from '../Key';

export enum InputKey {
  None = 0,
  Shift = 1,
  Control = 3,
  Alt = 5,
  Super = 7,
  Menu = 9,
  F1 = 10, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, F24, F25, F26, F27, F28, F29, F30, F31, F32, F33, F34, F35,
  Up = 45, Down, Left, Right,
  Enter = 49, Escape, Space, Tab, BackSpace, Insert, Delete, PageUp, PageDown, Home, End, CapsLock, ScrollLock, PrintScreen, Pause, NumLock, Clear, Sleep,
  Keypad0 = 67, Keypad1, Keypad2, Keypad3, Keypad4, Keypad5, Keypad6, Keypad7, Keypad8, Keypad9,
  KeypadDivide = 77, KeypadMultiply, KeypadSubtract, KeypadMinus = 79, KeypadAdd = 80, KeypadPlus = 80, KeypadDecimal, KeypadEnter,
  A = 83, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
  Number0 = 109, Number1, Number2, Number3, Number4, Number5, Number6, Number7, Number8, Number9,
  Tilde = 119, Minus, Plus, BracketLeft, BracketRight, Semicolon, Quote, Comma, Period, Slash, BackSlash, NonUSBackSlash,
  LastKey = 131,
  FirstMouseButton = 132, MouseLeft = 132, MouseMiddle = 133, MouseRight = 134,
  ExtraMouseButton1 = 135, ExtraMouseButton2, ExtraMouseButton3, ExtraMouseButton4, ExtraMouseButton5, ExtraMouseButton6, ExtraMouseButton7, ExtraMouseButton8, ExtraMouseButton9,
  MouseLastButton = 144,
  MouseWheelUp = 145, MouseWheelDown, MouseWheelRight, MouseWheelLeft,
  Mute = 256, PlayPause, Stop, VolumeUp, VolumeDown, TrackPrevious, TrackNext,
  LShift = 263, RShift, LControl, RControl, LAlt, RAlt, LSuper, RSuper,
}

/** InputKeyExtensions.IsVirtual */
export function isVirtual(key: InputKey): boolean {
  return key === InputKey.Shift || key === InputKey.Control || key === InputKey.Alt || key === InputKey.Super;
}

/** InputKeyExtensions.IsPhysical */
export function isPhysical(key: InputKey): boolean {
  return InputKey[key] !== undefined && !isVirtual(key) && key !== InputKey.None && key !== InputKey.LastKey;
}

/** InputKeyExtensions.GetVirtualKey */
export function getVirtualKey(key: InputKey): InputKey | null {
  switch (key) {
    case InputKey.LShift:
    case InputKey.RShift:
      return InputKey.Shift;

    case InputKey.LControl:
    case InputKey.RControl:
      return InputKey.Control;

    case InputKey.LAlt:
    case InputKey.RAlt:
      return InputKey.Alt;

    case InputKey.LSuper:
    case InputKey.RSuper:
      return InputKey.Super;
  }

  return null;
}

export enum KeyCombinationMatchingMode {
  /** Matches a KeyCombination regardless of any additional key presses. */
  Any,

  /** Matches a KeyCombination if there are no additional key presses. */
  Exact,

  /** Matches a KeyCombination regardless of any additional key presses, however key modifiers must match exactly. */
  Modifiers,
}

export enum SimultaneousBindingMode {
  /** One action can be in a pressed state at once. If a new matching binding is encountered, any existing binding is first released. */
  None,

  /** Unique actions are allowed to be pressed at the same time. There may therefore be more than one action in an actuated state at once. */
  Unique,

  /** Unique actions are allowed to be pressed at the same time, as well as multiple times from different bindings. */
  All,
}

/** Represent a combination of more than one InputKeys. */
export class KeyCombination {
  /** The keys, sorted ascending. */
  readonly keys: readonly InputKey[];

  constructor(keys: Iterable<InputKey> | null = null) {
    const list = keys === null ? [] : [...new Set(keys)];
    this.keys = list.length === 0 ? [InputKey.None] : list.sort((a, b) => a - b);
  }

  static of(...keys: InputKey[]): KeyCombination {
    return new KeyCombination(keys);
  }

  /** Check whether the provided pressed keys are valid for this KeyCombination. */
  isPressed(pressedKeys: KeyCombination, _inputState: InputState, matchingMode: KeyCombinationMatchingMode): boolean {
    if (this.keys === pressedKeys.keys) // Fast test for reference equality of underlying array
      return true;

    if (this.keys.length === 1 && this.keys[0] === InputKey.None)
      return false;

    return KeyCombination.containsAll(this.keys, pressedKeys.keys, matchingMode);
  }

  /** @internal */
  static containsAll(candidateKeyBinding: readonly InputKey[], pressedPhysicalKeys: readonly InputKey[], matchingMode: KeyCombinationMatchingMode): boolean {
    // first, check that all the candidate keys are contained in the provided pressed keys.
    // regardless of the matching mode, every key needs to at least be present (matching modes only change
    // the behaviour of excess keys).
    for (const key of candidateKeyBinding) {
      if (!KeyCombination.isKeyPressed(pressedPhysicalKeys, key))
        return false;
    }

    switch (matchingMode) {
      case KeyCombinationMatchingMode.Exact:
        for (const key of pressedPhysicalKeys) {
          // in exact matching mode, every pressed key needs to be in the candidate.
          if (!KeyCombination.keyBindingContains(candidateKeyBinding, key))
            return false;
        }

        break;

      case KeyCombinationMatchingMode.Modifiers:
        for (const key of pressedPhysicalKeys) {
          // in modifiers match mode, the same check applies as exact but only for modifier keys.
          if (KeyCombination.isModifierKey(key) && !KeyCombination.keyBindingContains(candidateKeyBinding, key))
            return false;
        }

        break;

      case KeyCombinationMatchingMode.Any:
        // any match mode needs no further checks.
        break;
    }

    return true;
  }

  /** @internal */
  static keyBindingContains(candidateKeyBinding: readonly InputKey[], physicalKey: InputKey): boolean {
    const vKey = getVirtualKey(physicalKey);
    return candidateKeyBinding.includes(physicalKey) || (vKey !== null && candidateKeyBinding.includes(vKey));
  }

  /** @internal */
  static isKeyPressed(pressedPhysicalKeys: readonly InputKey[], candidateKey: InputKey): boolean {
    if (isPhysical(candidateKey))
      return pressedPhysicalKeys.includes(candidateKey);

    for (const pk of pressedPhysicalKeys) {
      if (getVirtualKey(pk) === candidateKey)
        return true;
    }

    return false;
  }

  equals(other: KeyCombination): boolean {
    return this.keys.length === other.keys.length && this.keys.every((k, i) => k === other.keys[i]);
  }

  toString(): string {
    return this.keys.join(',');
  }

  static isModifierKey(key: InputKey): boolean {
    switch (key) {
      case InputKey.LControl:
      case InputKey.LShift:
      case InputKey.LAlt:
      case InputKey.LSuper:
      case InputKey.RControl:
      case InputKey.RShift:
      case InputKey.RAlt:
      case InputKey.RSuper:
      case InputKey.Control:
      case InputKey.Shift:
      case InputKey.Alt:
      case InputKey.Super:
        return true;
    }

    return false;
  }

  static fromKey(key: Key): InputKey {
    switch (key) {
      case Key.LShift: return InputKey.LShift;
      case Key.RShift: return InputKey.RShift;
      case Key.LControl: return InputKey.LControl;
      case Key.RControl: return InputKey.RControl;
      case Key.LAlt: return InputKey.LAlt;
      case Key.RAlt: return InputKey.RAlt;
      case Key.LWin: return InputKey.LSuper;
      case Key.RWin: return InputKey.RSuper;
    }

    return key as number as InputKey;
  }

  static fromMouseButton(button: MouseButton): InputKey {
    return InputKey.FirstMouseButton + button;
  }

  static fromScrollDelta(scrollDelta: Vector2): InputKey[] {
    const keys: InputKey[] = [];
    if (scrollDelta.y > 0) keys.push(InputKey.MouseWheelUp);
    if (scrollDelta.y < 0) keys.push(InputKey.MouseWheelDown);
    if (scrollDelta.x > 0) keys.push(InputKey.MouseWheelLeft);
    if (scrollDelta.x < 0) keys.push(InputKey.MouseWheelRight);
    return keys;
  }

  /** Construct a new instance from input state. */
  static fromInputState(state: InputState, scrollDelta: Vector2 | null = null): KeyCombination {
    const keys: InputKey[] = [];

    for (const button of state.mouse.buttons)
      keys.push(KeyCombination.fromMouseButton(button));

    if (scrollDelta !== null && (scrollDelta.x !== 0 || scrollDelta.y !== 0))
      keys.push(...KeyCombination.fromScrollDelta(scrollDelta));

    for (const key of state.keyboard.keys) {
      const iKey = KeyCombination.fromKey(key);
      if (!keys.includes(iKey))
        keys.push(iKey);
    }

    return new KeyCombination(keys);
  }
}

/** A binding of a KeyCombination to an action. */
export interface IKeyBinding {
  keyCombination: KeyCombination;
  action: unknown;
}

export class KeyBinding implements IKeyBinding {
  keyCombination: KeyCombination;

  constructor(keys: KeyCombination | InputKey | InputKey[], public action: unknown) {
    this.keyCombination = keys instanceof KeyCombination ? keys : new KeyCombination(Array.isArray(keys) ? keys : [keys]);
  }

  toString(): string {
    return `${this.keyCombination}=>${String(this.action)}`;
  }
}

export abstract class KeyBindingEvent<T> extends UIEvent {
  constructor(state: InputState, readonly action: T, readonly actionType: object) {
    super(state);
  }
}

export class KeyBindingPressEvent<T> extends KeyBindingEvent<T> {
  constructor(state: InputState, action: T, actionType: object, readonly repeat = false) {
    super(state, action, actionType);
  }
}

export class KeyBindingReleaseEvent<T> extends KeyBindingEvent<T> {}

export class KeyBindingScrollEvent<T> extends KeyBindingEvent<T> {
  constructor(state: InputState, action: T, actionType: object, readonly scrollAmount: number, readonly isPrecise = false) {
    super(state, action, actionType);
  }
}

/** A drawable that handles key bindings of the declared action types (IKeyBindingHandler<T>). */
export interface IKeyBindingHandler<T> {
  /** The action enum objects this drawable handles (e.g. [GlobalAction]). */
  readonly keyBindingActionTypes: readonly object[];

  onPressed(e: KeyBindingPressEvent<T>): boolean;

  onReleased(e: KeyBindingReleaseEvent<T>): void;
}

/** IScrollBindingHandler<T> */
export interface IScrollBindingHandler<T> extends IKeyBindingHandler<T> {
  onScrollBinding(e: KeyBindingScrollEvent<T>): boolean;
}

const handlesType = (d: Drawable, actionType: object): d is Drawable & IKeyBindingHandler<unknown> =>
  (d as Partial<IKeyBindingHandler<unknown>>).keyBindingActionTypes?.includes(actionType) === true;

/** Maps input actions to custom action data of type T. */
export abstract class KeyBindingContainer<T> extends Container {
  protected keyBindings: readonly IKeyBinding[] | null = null;

  abstract get defaultKeyBindings(): readonly IKeyBinding[];

  /** Whether to enable key repeat for this container. */
  protected get handleRepeats(): boolean {
    return true;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.reloadMappings();
  }

  protected reloadMappings(): void {
    this.keyBindings = this.defaultKeyBindings;
  }

  /** @param actionType the action enum object (C# generic argument T) */
  constructor(
    readonly actionType: object,
    private readonly simultaneousMode = SimultaneousBindingMode.None,
    private readonly matchingMode = KeyCombinationMatchingMode.Any,
  ) {
    super();

    this.relativeSizeAxes = Axes.Both;
  }

  private readonly pressedBindings: IKeyBinding[] = [];

  private readonly pressedActionsList: T[] = [];

  private readonly bindingInitiatingKeys = new Set<InputKey>();

  /** All actions in a currently pressed state. */
  get pressedActions(): readonly T[] {
    return this.pressedActionsList;
  }

  private readonly keyBindingQueues = new Map<IKeyBinding, Drawable[]>();

  private keyRepeatInputQueue: Drawable[] = [];

  /** The input queue to be used for processing key bindings. Based on the non-positional NonPositionalInputQueue. Can be overridden to change priorities. */
  protected get keyBindingInputQueue(): Drawable[] {
    const queue: Drawable[] = [];
    this.buildNonPositionalInputQueue(queue, false);
    queue.reverse();
    return queue;
  }

  /** Override to enable or disable sending of repeated actions (disabled by default). */
  protected get prioritised(): boolean {
    return false;
  }

  override buildNonPositionalInputQueue(queue: Drawable[], allowBlocking = true): boolean {
    if (!super.buildNonPositionalInputQueue(queue, allowBlocking))
      return false;

    if (this.prioritised) {
      const i = queue.indexOf(this);
      if (i >= 0) queue.splice(i, 1);
      queue.push(this);
    }

    return true;
  }

  override buildPositionalInputQueue(screenSpacePos: Vector2, queue: Drawable[]): boolean {
    if (!super.buildPositionalInputQueue(screenSpacePos, queue))
      return false;

    if (this.prioritised) {
      const i = queue.indexOf(this);
      if (i >= 0) queue.splice(i, 1);
      queue.push(this);
    }

    return true;
  }

  private readonly pressedInputKeys = new Set<InputKey>();

  protected override handle(e: UIEvent): boolean {
    const state = e.currentState;

    if (e instanceof MouseDownEvent)
      return this.handleNewPressed(state, KeyCombination.fromMouseButton(e.button));

    if (e instanceof MouseUpEvent) {
      this.handleNewReleased(state, KeyCombination.fromMouseButton(e.button));
      return false;
    }

    if (e instanceof KeyDownEvent) {
      if (e.repeat)
        return this.handleRepeat(state);

      return this.handleNewPressed(state, KeyCombination.fromKey(e.key));
    }

    if (e instanceof KeyUpEvent) {
      this.handleNewReleased(state, KeyCombination.fromKey(e.key));
      return false;
    }

    if (e instanceof ScrollEvent) {
      const keys = KeyCombination.fromScrollDelta(e.scrollDelta);
      let handled = false;

      for (const key of keys) {
        handled = this.handleNewPressed(state, key, e.scrollDelta, e.isPrecise) || handled;
        this.handleNewReleased(state, key);
      }

      return handled;
    }

    return false;
  }

  private handleRepeat(state: InputState): boolean {
    if (!this.handleRepeats)
      return false;

    if (this.pressedActionsList.length === 0)
      return false;

    // A simplistic approach to key repeat (that mostly matches OS level implementations) is that the last binding - or action - to
    // trigger is the one and only action to repeat.
    const action = this.pressedActionsList[this.pressedActionsList.length - 1];
    const pressEvent = new KeyBindingPressEvent<T>(state, action, this.actionType, true);

    // Only drawables that can still handle input should handle the repeat
    const current = this.keyBindingInputQueue;
    const drawables = this.keyRepeatInputQueue.filter(d => current.includes(d) && d.isAlive && d.isPresent);

    return drawables.some(d => this.triggerKeyBindingEvent(d, pressEvent));
  }

  private handleNewPressed(state: InputState, newKey: InputKey, scrollDelta: Vector2 | null = null, isPrecise = false): boolean {
    this.pressedInputKeys.add(newKey);

    const scrollAmount = KeyBindingContainer.getScrollAmount(newKey, scrollDelta);
    const pressedCombination = new KeyCombination(this.pressedInputKeys);

    let handled = false;
    const newlyPressed: IKeyBinding[] = [];

    if (this.keyBindings !== null) {
      for (const binding of this.keyBindings) {
        if (this.pressedBindings.includes(binding))
          continue;

        // Don't allow a binding to fire if any of its non-modifier keys were
        // already consumed by a previous binding that hasn't been fully released yet.
        if (binding.keyCombination.keys.some(key => !KeyCombination.isModifierKey(key) && this.bindingInitiatingKeys.has(key)))
          continue;

        if (binding.keyCombination.isPressed(pressedCombination, state, this.matchingMode))
          newlyPressed.push(binding);
      }
    }

    if (KeyCombination.isModifierKey(newKey)) {
      // if the current key pressed was a modifier, only handle modifier-only bindings.
      for (let i = 0; i < newlyPressed.length; i++) {
        if (!newlyPressed[i].keyCombination.keys.every(KeyCombination.isModifierKey))
          newlyPressed.splice(i--, 1);
      }
    }

    // we want to always handle bindings with more keys before bindings with less.
    newlyPressed.sort((a, b) => b.keyCombination.keys.length - a.keyCombination.keys.length);

    this.pressedBindings.push(...newlyPressed);

    // exact matching may result in no pressed (new or old) bindings, in which case we want to trigger releases for existing actions
    if (this.simultaneousMode === SimultaneousBindingMode.None
      && (this.matchingMode === KeyCombinationMatchingMode.Exact || this.matchingMode === KeyCombinationMatchingMode.Modifiers)) {
      // only want to release pressed actions if no existing bindings would still remain pressed
      if (this.pressedBindings.length > 0 && !this.pressedBindings.some(m => m.keyCombination.isPressed(pressedCombination, state, this.matchingMode)))
        this.releasePressedActions(state);
    }

    for (const newBinding of newlyPressed) {
      // we handled a new binding and there is an existing one. if we don't want concurrency, let's propagate a released event.
      if (this.simultaneousMode === SimultaneousBindingMode.None)
        this.releasePressedActions(state);

      const inputQueue = this.getInputQueue(newBinding, true);
      const handledBy = this.propagatePressed(inputQueue, state, newBinding.action as T, scrollAmount, isPrecise);

      if (handledBy !== null) {
        if (newBinding.keyCombination.keys.some(KeyCombination.isModifierKey)) {
          for (const key of newBinding.keyCombination.keys) {
            if (!KeyCombination.isModifierKey(key))
              this.bindingInitiatingKeys.add(key);
          }
        }

        // only drawables up to the one that handled the press should handle the release, so remove all subsequent drawables from the queue (for future use).
        const count = inputQueue.indexOf(handledBy) + 1;
        inputQueue.splice(count, inputQueue.length - count);

        handled = true;
      }

      this.keyRepeatInputQueue = inputQueue;

      // we only want to handle the first valid binding (the one with the most keys) in non-simultaneous mode.
      if (this.simultaneousMode === SimultaneousBindingMode.None && handled)
        break;
    }

    return handled;
  }

  private static getScrollAmount(newKey: InputKey, scrollDelta: Vector2 | null): number {
    switch (newKey) {
      case InputKey.MouseWheelUp:
        return scrollDelta?.y ?? 0;

      case InputKey.MouseWheelDown:
        return -(scrollDelta?.y ?? 0);

      case InputKey.MouseWheelRight:
        return scrollDelta?.x ?? 0;

      case InputKey.MouseWheelLeft:
        return -(scrollDelta?.x ?? 0);

      default:
        return 0;
    }
  }

  protected propagatePressed(drawables: readonly Drawable[], state: InputState, pressed: T, scrollAmount = 0, isPrecise = false, repeat = false): Drawable | null {
    let handled: Drawable | null = null;

    // only handle if we are a new non-pressed action (or a concurrency mode that supports multiple simultaneous triggers).
    if (this.simultaneousMode === SimultaneousBindingMode.All || !this.pressedActionsList.includes(pressed)) {
      this.pressedActionsList.push(pressed);

      if (scrollAmount !== 0) {
        const scrollEvent = new KeyBindingScrollEvent<T>(state, pressed, this.actionType, scrollAmount, isPrecise);
        handled = drawables.find(d => this.triggerKeyBindingEvent(d, scrollEvent)) ?? null;
      }

      if (handled === null) {
        const pressEvent = new KeyBindingPressEvent<T>(state, pressed, this.actionType, repeat);
        handled = drawables.find(d => this.triggerKeyBindingEvent(d, pressEvent)) ?? null;
      }
    }

    return handled;
  }

  /** Releases all pressed actions. Note that the relevant key bindings remain in a pressed state by the user and are not released by this method. */
  private releasePressedActions(state: InputState): void {
    for (const action of this.pressedActionsList) {
      const releaseEvent = new KeyBindingReleaseEvent<T>(state, action, this.actionType);

      for (const [binding, queue] of this.keyBindingQueues) {
        if (binding.action === action)
          queue.forEach(d => this.triggerKeyBindingEvent(d, releaseEvent));
      }
    }

    this.pressedActionsList.length = 0;
  }

  private handleNewReleased(state: InputState, releasedKey: InputKey): void {
    this.pressedInputKeys.delete(releasedKey);
    this.bindingInitiatingKeys.delete(releasedKey);

    if (this.pressedBindings.length === 0)
      return;

    // we don't want to consider exact matching here as we are dealing with bindings, not actions.
    const pressedCombination = new KeyCombination(this.pressedInputKeys);

    for (let i = 0; i < this.pressedBindings.length; i++) {
      const binding = this.pressedBindings[i];

      if (this.pressedInputKeys.size === 0 || !binding.keyCombination.isPressed(pressedCombination, state, KeyCombinationMatchingMode.Any)) {
        this.pressedBindings.splice(i--, 1);

        this.propagateReleased(this.getInputQueue(binding).filter(d => isRootedAt(d, this)), state, binding.action as T);
        this.keyBindingQueues.get(binding)!.length = 0;
      }
    }
  }

  protected propagateReleased(drawables: readonly Drawable[], state: InputState, released: T): void {
    // we either want multiple release events due to the simultaneous mode, or we only want one when we
    // - were pressed (as an action)
    // - are the last pressed binding with this action
    if (this.simultaneousMode === SimultaneousBindingMode.All
      || (this.pressedActionsList.includes(released) && this.pressedBindings.every(b => b.action !== released))) {
      const releaseEvent = new KeyBindingReleaseEvent<T>(state, released, this.actionType);

      for (const d of drawables) {
        if (handlesType(d, this.actionType))
          this.triggerKeyBindingEvent(d, releaseEvent);
      }

      const i = this.pressedActionsList.indexOf(released);
      if (i >= 0) this.pressedActionsList.splice(i, 1);
    }
  }

  /** Bypass the regular input path to trigger the release of an action. */
  triggerReleased(released: T): void {
    this.propagateReleased(this.keyBindingInputQueue, this.containingState(), released);
  }

  /** Bypass the regular input path to trigger the press of an action. Returns the drawable which handled it, or null. */
  triggerPressed(pressed: T): Drawable | null {
    const state = this.containingState();

    if (this.simultaneousMode === SimultaneousBindingMode.None)
      this.releasePressedActions(state);

    return this.propagatePressed(this.keyBindingInputQueue, state, pressed);
  }

  private containingState(): InputState {
    return this.findClosestParent(InputManager)?.currentState ?? new InputState();
  }

  private getInputQueue(binding: IKeyBinding, rebuildIfEmpty = false): Drawable[] {
    let currentQueue = this.keyBindingQueues.get(binding);

    if (currentQueue === undefined)
      this.keyBindingQueues.set(binding, currentQueue = []);

    if (rebuildIfEmpty && currentQueue.length === 0)
      currentQueue.push(...this.keyBindingInputQueue);

    return currentQueue;
  }

  private triggerKeyBindingEvent(drawable: Drawable, e: KeyBindingEvent<T>): boolean {
    e.target = drawable;

    if (!handlesType(drawable, this.actionType))
      return false;

    if (e instanceof KeyBindingPressEvent)
      return drawable.onPressed(e);

    if (e instanceof KeyBindingReleaseEvent) {
      drawable.onReleased(e);
      return false;
    }

    if (e instanceof KeyBindingScrollEvent)
      return (drawable as Partial<IScrollBindingHandler<T>>).onScrollBinding?.(e) ?? false;

    throw new Error(`Invalid event type: ${e.constructor.name}`);
  }
}
