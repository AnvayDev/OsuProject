// Ported from osu.Framework/Input/InputManager.cs, PassThroughInputManager.cs, UserInputManager.cs, CustomInputManager.cs
// and Handlers/InputHandler.cs. Touch, tablet, joystick and MIDI paths are omitted (no such devices in the web port).

import type { IFocusManager } from './IFocusManager';
import { Container } from '../graphics/containers/Container';
import { Drawable } from '../graphics/Drawable';
import { Axes } from '../layout/Enums';
import { Vector2 } from '../layout/Vector2';
import { KeyEventManager, MouseButtonEventManager } from './ButtonEventManagers';
import {
  FocusEvent, FocusLostEvent, HoverEvent, HoverLostEvent, KeyDownEvent, KeyUpEvent, MouseDownEvent, MouseMoveEvent, MouseUpEvent,
  ScrollEvent, type UIEvent,
} from './events/UIEvents';
import { InputState, KeyboardState, MouseState } from './InputState';
import { Key, MouseButton } from './Key';
import {
  ButtonStateChangeEvent, ButtonStateChangeKind, KeyboardKeyInput, MouseButtonInput, MousePositionAbsoluteInput, MousePositionChangeEvent,
  MouseScrollChangeEvent, MouseScrollRelativeInput, type IInput, type IInputStateChangeHandler, type InputStateChangeEvent,
} from './StateChanges';

const repeat_initial_delay = 250;
const repeat_tick_rate = 70;

/** Ported from osu.Framework/Input/Handlers/InputHandler.cs */
export abstract class InputHandler {
  /** Whether this InputHandler is enabled and active. */
  isActive = true;

  private readonly pendingInputs: IInput[] = [];

  protected enqueueInput(input: IInput): void {
    this.pendingInputs.push(input);
  }

  /** Retrieve a list of all pending states since the last call to this method. */
  collectPendingInputs(inputs: IInput[]): void {
    inputs.push(...this.pendingInputs);
    this.pendingInputs.length = 0;
  }
}

/** Marker for drawables that need mouse move events every frame (IRequireHighFrequencyMousePosition). */
export interface IRequireHighFrequencyMousePosition {
  readonly requireHighFrequencyMousePosition: true;
}

const requiresHighFrequency = (d: Drawable) => (d as Partial<IRequireHighFrequencyMousePosition>).requireHighFrequencyMousePosition === true;

export abstract class InputManager extends Container implements IInputStateChangeHandler, IFocusManager {
  readonly isFocusManager = true;

  /** The currently focused Drawable. Null if there is no current focus. */
  focusedDrawable: Drawable | null = null;

  /** @internal */ focusedDrawableThisClick: Drawable | null = null;

  protected abstract get inputHandlers(): readonly InputHandler[];

  private keyboardRepeatTime = 0;
  private keyboardRepeatKey: Key | null = null;

  /** The initial input state. currentState is expected to be equal to this after construction. */
  protected createInitialState(): InputState {
    const mouse = new MouseState();
    mouse.isPositionValid = false;
    return new InputState(mouse, new KeyboardState());
  }

  /** The current input state. Mouse coordinates are in screen space. */
  readonly currentState: InputState;

  /** The Drawable that is currently being dragged. Null if none is. */
  get draggedDrawable(): Drawable | null {
    return this.mouseButtonEventManagers.get(MouseButton.Left)?.draggedDrawable ?? null;
  }

  private readonly lastHoveredDrawables: Drawable[] = [];
  private readonly hoveredDrawablesList: Drawable[] = [];
  private hoverHandledDrawable: Drawable | null = null;

  /** Contains all hovered Drawables in top-down order up to the first which returned true in its onHover event. */
  get hoveredDrawables(): readonly Drawable[] {
    return this.hoveredDrawablesList;
  }

  /** Contains all Drawables in top-down order which are considered for positional input. */
  get positionalInputQueue(): readonly Drawable[] {
    return this.buildPositionalInputQueueAt(this.currentState.mouse.position);
  }

  /** Contains all Drawables in top-down order which are considered for non-positional input. */
  get nonPositionalInputQueue(): readonly Drawable[] {
    return this.buildNonPositionalInputQueueList();
  }

  private readonly mouseButtonEventManagers = new Map<MouseButton, MouseButtonEventManager>();
  private readonly keyButtonEventManagers = new Map<Key, KeyEventManager>();

  constructor() {
    super();

    this.currentState = this.createInitialState();
    this.relativeSizeAxes = Axes.Both;

    for (const button of [MouseButton.Left, MouseButton.Middle, MouseButton.Right, MouseButton.Button1, MouseButton.Button2, MouseButton.Button3,
      MouseButton.Button4, MouseButton.Button5, MouseButton.Button6, MouseButton.Button7, MouseButton.Button8, MouseButton.Button9]) {
      const manager = this.createButtonEventManagerFor(button);
      manager.inputManager = this;
      manager.getInputQueue = () => this.positionalInputQueue;
      this.mouseButtonEventManagers.set(button, manager);
    }
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // Set mouse position to zero in input manager local space instead of screen space zero.
    // This ensures initial mouse position is non-negative in nested input managers whose origin is not (0, 0).
    this.currentState.mouse.position = this.toScreenSpace(Vector2.Zero);
  }

  /** Create a MouseButtonEventManager for a specified mouse button. */
  protected createButtonEventManagerFor(button: MouseButton): MouseButtonEventManager {
    return button === MouseButton.Left ? new MouseLeftButtonEventManager(button) : new MouseMinorButtonEventManager(button);
  }

  /** Get the MouseButtonEventManager for a specified mouse button. */
  getButtonEventManagerFor(button: MouseButton): MouseButtonEventManager | undefined {
    return this.mouseButtonEventManagers.get(button);
  }

  /** Get the KeyEventManager for a specified key. */
  getKeyEventManagerFor(key: Key): KeyEventManager {
    const existing = this.keyButtonEventManagers.get(key);
    if (existing !== undefined)
      return existing;

    const manager = new KeyEventManager(key);
    manager.inputManager = this;
    manager.getInputQueue = () => this.nonPositionalInputQueue;
    this.keyButtonEventManagers.set(key, manager);
    return manager;
  }

  /** Reset current focused drawable to the top-most drawable which is requestsFocus. */
  triggerFocusContention(_triggerSource: Drawable | null = null): void {
    if (this.focusedDrawable === null) return;

    this.changeFocusTo(null);
  }

  /** Changes the currently-focused drawable. First checks that potentialFocusTarget is in a valid state to receive focus, then unfocuses the current focusedDrawable and focuses potentialFocusTarget. */
  changeFocus(potentialFocusTarget: Drawable | null, state: InputState = this.currentState): boolean {
    if (potentialFocusTarget === this.focusedDrawable) {
      this.focusedDrawableThisClick = this.focusedDrawable;
      return true;
    }

    if (potentialFocusTarget !== null && (!this.isDrawableValidForFocus(potentialFocusTarget) || !potentialFocusTarget.acceptsFocus))
      return false;

    const previousFocus = this.focusedDrawable;

    this.focusedDrawable = null;

    if (previousFocus !== null) {
      previousFocus.hasFocus = false;
      previousFocus.triggerEvent(new FocusLostEvent(state, potentialFocusTarget));

      if (this.focusedDrawable !== null) throw new Error('Focus cannot be changed inside OnFocusLost');
    }

    this.focusedDrawable = potentialFocusTarget;

    if (this.focusedDrawable !== null) {
      this.focusedDrawable.hasFocus = true;
      this.focusedDrawable.triggerEvent(new FocusEvent(state, previousFocus));
    }

    this.focusedDrawableThisClick = this.focusedDrawable;

    return true;
  }

  private changeFocusTo(potentialFocusTarget: Drawable | null): boolean {
    return this.changeFocus(potentialFocusTarget, this.currentState);
  }

  override buildNonPositionalInputQueue(queue: Drawable[], allowBlocking = true): boolean {
    if (!allowBlocking)
      super.buildNonPositionalInputQueue(queue, false);

    return false;
  }

  override buildPositionalInputQueue(_screenSpacePos: Vector2, _queue: Drawable[]): boolean {
    return false;
  }

  private hoverEventsUpdated = false;

  private readonly highFrequencyDrawables: Drawable[] = [];

  private lastMouseMove: MouseMoveEvent | null = null;

  protected override update(): void {
    this.unfocusIfNoLongerValid();

    this.hoverEventsUpdated = false;

    const pendingInputs = this.getPendingInputs();

    if (pendingInputs.length > 0)
      this.lastMouseMove = null;

    for (const result of pendingInputs)
      result.apply(this.currentState, this);

    if (this.currentState.mouse.isPositionValid) {
      for (const d of this.positionalInputQueue) {
        if (requiresHighFrequency(d))
          this.highFrequencyDrawables.push(d);
      }

      if (this.highFrequencyDrawables.length > 0) {
        // conditional avoid allocs of MouseMoveEvent when state is guaranteed to not have been mutated.
        this.lastMouseMove ??= new MouseMoveEvent(this.currentState);
        this.propagateBlockableEvent(this.highFrequencyDrawables, this.lastMouseMove);
      }

      this.highFrequencyDrawables.length = 0;
    }

    this.updateKeyRepeat(this.currentState);

    // Other inputs or drawable changes may affect hover even if
    // there were no mouse movements, so it must be updated every frame.
    if (!this.hoverEventsUpdated)
      this.updateHoverEvents(this.currentState);

    if (this.focusedDrawable === null)
      this.focusTopMostRequestingDrawable();

    super.update();
  }

  private updateKeyRepeat(state: InputState): void {
    if (this.keyboardRepeatKey === null) return;

    this.keyboardRepeatTime -= this.clock!.elapsedFrameTime;

    while (this.keyboardRepeatTime < 0) {
      this.getKeyEventManagerFor(this.keyboardRepeatKey).handleRepeat(state);
      this.keyboardRepeatTime += repeat_tick_rate;
    }
  }

  private readonly inputs: IInput[] = [];

  protected getPendingInputs(): IInput[] {
    this.inputs.length = 0;

    for (const h of this.inputHandlers) {
      if (!h.isActive)
        continue;

      h.collectPendingInputs(this.inputs);
    }

    return this.inputs;
  }

  private buildNonPositionalInputQueueList(): Drawable[] {
    const inputQueue: Drawable[] = [];

    const children = this.aliveInternalChildren;

    for (let i = 0; i < children.length; i++) {
      if (this.shouldBeConsideredForInput(children[i]))
        children[i].buildNonPositionalInputQueue(inputQueue);
    }

    if (!this.unfocusIfNoLongerValid()) {
      const i = inputQueue.indexOf(this.focusedDrawable!);
      if (i >= 0) inputQueue.splice(i, 1);
      inputQueue.push(this.focusedDrawable!);
    }

    // queues were created in back-to-front order.
    // We want input to first reach front-most drawables, so the queues
    // need to be reversed.
    inputQueue.reverse();

    return inputQueue;
  }

  private buildPositionalInputQueueAt(screenSpacePos: Vector2): Drawable[] {
    const positionalInputQueue: Drawable[] = [];

    const children = this.aliveInternalChildren;

    for (let i = 0; i < children.length; i++) {
      if (this.shouldBeConsideredForInput(children[i]))
        children[i].buildPositionalInputQueue(screenSpacePos, positionalInputQueue);
    }

    positionalInputQueue.reverse();
    return positionalInputQueue;
  }

  /** Whether this input manager should update hover events. */
  get handleHoverEvents(): boolean {
    return true;
  }

  private updateHoverEvents(state: InputState): void {
    const lastHoverHandledDrawable = this.hoverHandledDrawable;
    this.hoverHandledDrawable = null;

    this.lastHoveredDrawables.length = 0;
    this.lastHoveredDrawables.push(...this.hoveredDrawablesList);

    this.hoveredDrawablesList.length = 0;

    // New drawables shouldn't be hovered if the cursor isn't in the window
    if (this.handleHoverEvents) {
      // First, we need to construct hoveredDrawables for the current frame
      for (const d of this.positionalInputQueue) {
        this.hoveredDrawablesList.push(d);
        const i = this.lastHoveredDrawables.indexOf(d);
        if (i >= 0) this.lastHoveredDrawables.splice(i, 1);

        // Don't need to re-hover those that are already hovered
        if (d.isHovered) {
          // Check if this drawable previously handled hover, and assume it would once more
          if (d === lastHoverHandledDrawable) {
            this.hoverHandledDrawable = lastHoverHandledDrawable;
            break;
          }

          continue;
        }

        d.isHovered = true;

        if (d.triggerEvent(new HoverEvent(state))) {
          this.hoverHandledDrawable = d;
          break;
        }
      }
    }

    // Unhover all previously hovered drawables which are no longer hovered.
    for (const d of this.lastHoveredDrawables) {
      d.isHovered = false;
      d.triggerEvent(new HoverLostEvent(state));
    }

    this.hoverEventsUpdated = true;
  }

  private isModifierKey(k: Key): boolean {
    return k === Key.LControl || k === Key.RControl
      || k === Key.LAlt || k === Key.RAlt
      || k === Key.LShift || k === Key.RShift
      || k === Key.LWin || k === Key.RWin;
  }

  protected handleKeyboardKeyStateChange(keyboardKeyStateChange: ButtonStateChangeEvent<Key>): void {
    const state = keyboardKeyStateChange.state;
    const key = keyboardKeyStateChange.button;
    const kind = keyboardKeyStateChange.kind;

    this.getKeyEventManagerFor(key).handleButtonStateChange(state, kind);

    if (kind === ButtonStateChangeKind.Pressed) {
      if (!this.isModifierKey(key)) {
        this.keyboardRepeatKey = key;
        this.keyboardRepeatTime = repeat_initial_delay;
      }
    } else {
      if (key === this.keyboardRepeatKey) {
        this.keyboardRepeatKey = null;
        this.keyboardRepeatTime = 0;
      }
    }
  }

  handleInputStateChange(inputStateChange: InputStateChangeEvent): void {
    if (inputStateChange instanceof MousePositionChangeEvent) {
      this.handleMousePositionChange(inputStateChange);
      return;
    }

    if (inputStateChange instanceof MouseScrollChangeEvent) {
      this.handleMouseScrollChange(inputStateChange);
      return;
    }

    if (inputStateChange instanceof ButtonStateChangeEvent) {
      if (inputStateChange.input instanceof MouseButtonInput)
        this.handleMouseButtonStateChange(inputStateChange as ButtonStateChangeEvent<MouseButton>);
      else if (inputStateChange.input instanceof KeyboardKeyInput)
        this.handleKeyboardKeyStateChange(inputStateChange as ButtonStateChangeEvent<Key>);
    }
  }

  protected handleMousePositionChange(e: MousePositionChangeEvent): void {
    const state = e.state;

    this.handleMouseMove(state, e.lastPosition);

    for (const manager of this.mouseButtonEventManagers.values())
      manager.handlePositionChange(state, e.lastPosition);

    this.updateHoverEvents(state);
  }

  protected handleMouseScrollChange(e: MouseScrollChangeEvent): void {
    this.handleScroll(e.state, e.lastScroll, e.isPrecise);
  }

  protected handleMouseButtonStateChange(e: ButtonStateChangeEvent<MouseButton>): void {
    this.mouseButtonEventManagers.get(e.button)?.handleButtonStateChange(e.state, e.kind);
  }

  private handleMouseMove(state: InputState, lastPosition: Vector2): boolean {
    return this.propagateBlockableEvent(this.positionalInputQueue, this.lastMouseMove = new MouseMoveEvent(state, lastPosition));
  }

  private handleScroll(state: InputState, lastScroll: Vector2, isPrecise: boolean): boolean {
    return this.propagateBlockableEvent(this.positionalInputQueue, new ScrollEvent(state, state.mouse.scroll.sub(lastScroll), isPrecise));
  }

  /** Triggers events on drawables in drawables until it is handled. Returns whether the event was handled. */
  protected propagateBlockableEvent(drawables: readonly Drawable[], e: UIEvent): boolean {
    for (const d of drawables) {
      if (d.triggerEvent(e))
        return true;
    }

    return false;
  }

  /** Unfocus the current focused drawable if it is no longer in a valid state. Returns true if there is no longer a focus. */
  private unfocusIfNoLongerValid(): boolean {
    if (this.focusedDrawable === null) return true;

    if (this.isDrawableValidForFocus(this.focusedDrawable))
      return false;

    this.changeFocusTo(null);
    return true;
  }

  private isDrawableValidForFocus(drawable: Drawable): boolean {
    let valid = drawable.isAlive && drawable.isPresent && drawable.parent !== null;

    if (valid) {
      //ensure we are visible
      let d = drawable.parent;

      while (d !== null) {
        if (!d.isPresent || !d.isAlive) {
          valid = false;
          break;
        }

        d = d.parent;
      }
    }

    return valid;
  }

  /** @internal */
  changeFocusFromClick(clickedDrawable: Drawable | null): void {
    let focusTarget: Drawable | null = null;

    if (clickedDrawable !== null) {
      focusTarget = clickedDrawable;

      if (!focusTarget.acceptsFocus) {
        // search upwards from the clicked drawable until we find something to handle focus.
        const previousFocused = this.focusedDrawable;

        while (focusTarget !== null && !focusTarget.acceptsFocus)
          focusTarget = focusTarget.parent;

        if (focusTarget !== null && previousFocused !== null) {
          // we found a focusable target above us.
          // now search upwards from previousFocused to check whether focusTarget is a common parent.
          let search: Drawable | null = previousFocused;
          while (search !== null && search !== focusTarget)
            search = search.parent;

          if (focusTarget === search)
            // we have a common parent, so let's keep focus on the previously focused target.
            focusTarget = previousFocused;
        }
      }
    }

    this.changeFocusTo(focusTarget);
  }

  private focusTopMostRequestingDrawable(): void {
    // todo: don't rebuild input queue every frame
    for (const d of this.nonPositionalInputQueue) {
      if (d.requestsFocus) {
        this.changeFocusTo(d);
        return;
      }
    }

    this.changeFocusTo(null);
  }
}

class MouseLeftButtonEventManager extends MouseButtonEventManager {
  get enableDrag(): boolean { return true; }
  get enableClick(): boolean { return true; }
  get changeFocusOnClick(): boolean { return true; }
}

class MouseMinorButtonEventManager extends MouseButtonEventManager {
  get enableDrag(): boolean { return false; }
  get enableClick(): boolean { return false; }
  get changeFocusOnClick(): boolean { return false; }
}

/** An InputManager with no handlers of its own (CustomInputManager). */
export class CustomInputManager extends InputManager {
  private readonly handlers: InputHandler[] = [];

  protected get inputHandlers(): readonly InputHandler[] {
    return this.handlers;
  }

  protected addHandler(handler: InputHandler): void {
    this.handlers.push(handler);
  }
}

/** An InputManager which can be nested; by default it re-synthesises its parent's input into its own state. */
export class PassThroughInputManager extends CustomInputManager implements IRequireHighFrequencyMousePosition {
  readonly requireHighFrequencyMousePosition = true as const;

  private _useParentInput = true;

  /** If there's an InputManager above us, decide whether we should use their available state. */
  get useParentInput(): boolean {
    return this._useParentInput;
  }

  set useParentInput(value: boolean) {
    if (this._useParentInput === value) return;

    this._useParentInput = value;

    if (this.useParentInput)
      this.syncWithParent();
  }

  private parentInputManager: InputManager | null = null;

  protected override loadComplete(): void {
    super.loadComplete();

    this.parentInputManager = this.findClosestParent(InputManager);
    this.syncWithParent();
  }

  override get handleHoverEvents(): boolean {
    return this.parentInputManager !== null && this.useParentInput ? this.parentInputManager.handleHoverEvents : super.handleHoverEvents;
  }

  override buildNonPositionalInputQueue(queue: Drawable[], allowBlocking = true): boolean {
    if (!this.propagateNonPositionalInputSubTree) return false;

    if (!allowBlocking)
      super.buildNonPositionalInputQueue(queue, false);
    else
      queue.push(this);

    return false;
  }

  override buildPositionalInputQueue(_screenSpacePos: Vector2, queue: Drawable[]): boolean {
    if (!this.propagatePositionalInputSubTree) return false;

    queue.push(this);
    return false;
  }

  protected override getPendingInputs(): IInput[] {
    //we still want to call the base method to clear any pending states that may build up.
    const pendingInputs = super.getPendingInputs();

    if (this.useParentInput)
      pendingInputs.length = 0;

    return pendingInputs;
  }

  protected override handle(e: UIEvent): boolean {
    if (!this.useParentInput) return false;

    if (e instanceof MouseDownEvent)
      new MouseButtonInput(e.button, true).apply(this.currentState, this);
    else if (e instanceof MouseUpEvent)
      new MouseButtonInput(e.button, false).apply(this.currentState, this);
    else if (e instanceof MouseMoveEvent) {
      if (!e.screenSpaceMousePosition.equals(this.currentState.mouse.position))
        new MousePositionAbsoluteInput(e.screenSpaceMousePosition).apply(this.currentState, this);
    } else if (e instanceof ScrollEvent)
      new MouseScrollRelativeInput(e.scrollDelta, e.isPrecise).apply(this.currentState, this);
    else if (e instanceof KeyDownEvent) {
      if (e.repeat)
        return false;

      new KeyboardKeyInput(e.key, true).apply(this.currentState, this);
    } else if (e instanceof KeyUpEvent)
      new KeyboardKeyInput(e.key, false).apply(this.currentState, this);

    return false;
  }

  protected override update(): void {
    super.update();

    // There are scenarios wherein we cannot receive the release events of pressed inputs. For simplicity, sync every frame.
    // This intentionally omits mouse position syncing because they don't apply to the above logic of "being unable to receive" such events
    if (this.useParentInput)
      this.syncReleasedInputs();
  }

  private syncWithParent(): void {
    this.syncReleasedInputs();
    this.syncMousePosition();
  }

  private syncReleasedInputs(): void {
    if (this.parentInputManager === null)
      return;

    const parentState = this.parentInputManager.currentState;
    const mouseDiff = parentState.mouse.buttons.enumerateDifference(this.currentState.mouse.buttons);
    const keyDiff = parentState.keyboard.keys.enumerateDifference(this.currentState.keyboard.keys);

    if (mouseDiff.released.length > 0)
      new MouseButtonInput(mouseDiff.released.map(button => ({ button, isPressed: false }))).apply(this.currentState, this);

    for (const key of keyDiff.released)
      new KeyboardKeyInput(key, false).apply(this.currentState, this);
  }

  private syncMousePosition(): void {
    if (this.parentInputManager === null)
      return;

    const parentMousePosition = this.parentInputManager.currentState.mouse.position;
    if (!parentMousePosition.equals(this.currentState.mouse.position))
      new MousePositionAbsoluteInput(parentMousePosition).apply(this.currentState, this);
  }
}

/** The root InputManager, receiving inputs from the host's handlers. */
export class UserInputManager extends PassThroughInputManager {
  constructor(private readonly handlerSource: () => readonly InputHandler[], private readonly cursorInWindow: () => boolean) {
    super();

    // UserInputManager is at the very top of the draw hierarchy, so it has no parent updating its IsAlive state
    this.isAlive = true;
    this.useParentInput = false;
  }

  protected override get inputHandlers(): readonly InputHandler[] {
    return this.handlerSource();
  }

  override get handleHoverEvents(): boolean {
    return this.cursorInWindow();
  }

  override get shouldBeAlive(): boolean {
    return true;
  }

  override handleInputStateChange(inputStateChange: InputStateChangeEvent): void {
    // presses registered when the mouse pointer is outside the window are ignored.
    // however, releases registered when the mouse pointer is outside the window cannot be ignored;
    if (inputStateChange instanceof ButtonStateChangeEvent && inputStateChange.input instanceof MouseButtonInput
      && inputStateChange.kind === ButtonStateChangeKind.Pressed && !this.cursorInWindow())
      return;

    if (inputStateChange instanceof MouseScrollChangeEvent && !this.cursorInWindow())
      return;

    super.handleInputStateChange(inputStateChange);
  }
}

Drawable.containingInputManagerResolver = d => d.findClosestParent(InputManager);
