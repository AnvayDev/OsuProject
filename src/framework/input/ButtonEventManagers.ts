// Ported from osu.Framework/Input/ButtonEventManager.cs, MouseButtonEventManager.cs and KeyEventManager.cs.

import type { Drawable } from '../graphics/Drawable';
import { Invalidation } from '../layout/Enums';
import { Vector2 } from '../layout/Vector2';
import { ClickEvent, DoubleClickEvent, DragEndEvent, DragEvent, DragStartEvent, KeyDownEvent, KeyUpEvent, MouseDownEvent, MouseUpEvent, type UIEvent } from './events/UIEvents';
import type { InputManager } from './InputManager';
import type { InputState } from './InputState';
import type { Key, MouseButton } from './Key';
import { ButtonStateChangeKind } from './StateChanges';

export function isRootedAt(drawable: Drawable | null, root: Drawable): boolean {
  if (drawable === root) return true;

  while ((drawable = drawable?.parent ?? null) !== null) {
    if (drawable === root)
      return true;
  }

  return false;
}

/** Manages state and events (e.g. ButtonDown, ButtonUp) for a single button. */
export abstract class ButtonEventManager<TButton> {
  /** @internal The input manager. */
  inputManager!: InputManager;

  /** The list of drawables that received the last button down event, in order, up to the one that handled it. */
  protected buttonDownInputQueue: Drawable[] | null = null;

  /** The input queue for propagating button up/down events. */
  protected get inputQueue(): readonly Drawable[] {
    return this.getInputQueue();
  }

  /** @internal */ getInputQueue!: () => readonly Drawable[];

  constructor(readonly button: TButton) {}

  /** Handles the button state changing. */
  handleButtonStateChange(state: InputState, kind: ButtonStateChangeKind): void {
    if (kind === ButtonStateChangeKind.Pressed)
      this.handleButtonDownInternal(state);
    else
      this.handleButtonUpInternal(state);
  }

  private handleButtonDownInternal(state: InputState): boolean {
    const inputQueue = [...this.inputQueue];
    const handledBy = this.handleButtonDown(state, inputQueue);

    if (handledBy !== null) {
      // only drawables up to the one that handled mouse down should handle mouse up, so remove all subsequent drawables from the queue (for future use).
      const count = inputQueue.indexOf(handledBy) + 1;
      inputQueue.splice(count, inputQueue.length - count);
    }

    this.buttonDownInputQueue = inputQueue;

    return handledBy !== null;
  }

  /** Handles a button down. Returns the Drawable which handled the event, or null. */
  protected abstract handleButtonDown(state: InputState, targets: Drawable[]): Drawable | null;

  private handleButtonUpInternal(state: InputState): void {
    // in rare cases, a button up event may arrive without a preceding mouse down event.
    if (this.buttonDownInputQueue === null)
      return;

    this.handleButtonUp(state, this.buttonDownInputQueue.filter(d => isRootedAt(d, this.inputManager)));

    this.buttonDownInputQueue = null;
  }

  /** Handles a button up. */
  protected abstract handleButtonUp(state: InputState, targets: Drawable[] | null): void;

  /** Triggers events on drawables in drawables until it is handled. Returns the drawable which handled the event or null. */
  protected propagateButtonEvent(drawables: Iterable<Drawable>, e: UIEvent): Drawable | null {
    for (const target of drawables) {
      if (target.triggerEvent(e))
        return target;
    }

    return null;
  }
}

/** A ButtonEventManager for mouse button. */
export abstract class MouseButtonEventManager extends ButtonEventManager<MouseButton> {
  /** Whether dragging is handled by the managed button. */
  abstract get enableDrag(): boolean;

  /** Whether click and double click are handled by the managed button. */
  abstract get enableClick(): boolean;

  /** Whether focus is changed when the button is clicked. */
  abstract get changeFocusOnClick(): boolean;

  /** @internal */ blockNextClick = false;

  /** The maximum time between two clicks for a double-click to be considered. */
  get doubleClickTime(): number {
    return 250;
  }

  /** The distance that must be moved until a dragged click becomes invalid. */
  get clickDragDistance(): number {
    return 10;
  }

  /** The position of the mouse when the last time the button was pressed. */
  mouseDownPosition: Vector2 | null = null;

  /** The time of last click. */
  protected lastClickTime: number | null = null;

  /** The drawable which is clicked by the last click. (C# keeps a weak reference.) */
  protected clickedDrawable: Drawable | null = null;

  /** Whether a drag operation has started and draggedDrawable has been searched for. */
  protected dragStarted = false;

  /** The Drawable which is currently being dragged. null if none is. */
  draggedDrawable: Drawable | null = null;

  handlePositionChange(state: InputState, lastPosition: Vector2): void {
    if (this.enableDrag) {
      if (!this.dragStarted) {
        const mouse = state.mouse;

        if (mouse.isPressed(this.button) && Vector2.distance(this.mouseDownPosition ?? mouse.position, mouse.position) > this.clickDragDistance)
          this.handleDragStart(state);
      }

      if (this.dragStarted)
        this.handleDrag(state, lastPosition);
    }
  }

  protected handleButtonDown(state: InputState, targets: Drawable[]): Drawable | null {
    if (state.mouse.isPositionValid)
      this.mouseDownPosition = state.mouse.position;

    const handledBy = this.propagateButtonEvent(targets, new MouseDownEvent(state, this.button, this.mouseDownPosition));

    if (this.lastClickTime !== null && this.inputManager.timeCurrent - this.lastClickTime < this.doubleClickTime) {
      if (this.handleDoubleClick(state, targets)) {
        //when we handle a double-click we want to block a normal click from firing.
        this.blockNextClick = true;
        this.lastClickTime = null;
      }
    }

    return handledBy;
  }

  protected handleButtonUp(state: InputState, targets: Drawable[] | null): void {
    if (targets !== null)
      this.propagateButtonEvent(targets, new MouseUpEvent(state, this.button, this.mouseDownPosition));

    if (this.enableClick && this.draggedDrawable?.dragBlocksClick !== true) {
      if (!this.blockNextClick) {
        this.lastClickTime = this.inputManager.timeCurrent;
        this.handleClick(state, targets);
      }
    }

    this.blockNextClick = false;

    if (this.enableDrag) {
      this.dragStarted = false;
      this.handleDragDrawableEnd(state);
    }

    this.mouseDownPosition = null;
  }

  private handleClick(state: InputState, targets: Drawable[] | null): void {
    if (targets === null) return;

    // due to the laziness of IEnumerable, .Where check should be done right before it is triggered for the event.
    const queue = this.inputQueue;
    const drawables = targets.filter(t => queue.includes(t) && t.isAlive && t.isPresent && t.receivePositionalInputAt(state.mouse.position));

    this.inputManager.focusedDrawableThisClick = null;

    const clicked = this.propagateButtonEvent(drawables, new ClickEvent(state, this.button, this.mouseDownPosition));
    this.clickedDrawable = clicked;

    // Focus shall only change if it wasn't explicitly changed during the click (for example, using a button to open a menu).
    if (this.inputManager.focusedDrawableThisClick === null) {
      if (this.changeFocusOnClick && clicked?.changeFocusOnClick !== false)
        this.inputManager.changeFocusFromClick(clicked);
    }

    this.inputManager.focusedDrawableThisClick = null;
  }

  private handleDoubleClick(state: InputState, targets: Drawable[]): boolean {
    const clicked = this.clickedDrawable;

    if (clicked === null)
      return false;

    if (!targets.includes(clicked))
      return false;

    return this.propagateButtonEvent([clicked], new DoubleClickEvent(state, this.button, this.mouseDownPosition)) !== null;
  }

  private handleDrag(state: InputState, lastPosition: Vector2): void {
    if (this.draggedDrawable === null) return;

    //Once a drawable is dragged, it remains in a dragged state until the drag is finished.
    this.propagateButtonEvent([this.draggedDrawable], new DragEvent(state, this.button, this.mouseDownPosition, lastPosition));
  }

  private handleDragStart(state: InputState): void {
    this.dragStarted = true;

    const drawables = this.buttonDownInputQueue!.filter(d => isRootedAt(d, this.inputManager));

    const draggable = this.propagateButtonEvent(drawables, new DragStartEvent(state, this.button, this.mouseDownPosition));
    if (draggable !== null)
      this.handleDragDrawableBegin(draggable);
  }

  private handleDragDrawableBegin(drawable: Drawable): void {
    this.draggedDrawable = drawable;
    this.draggedDrawable.isDragged = true;
    this.draggedDrawable.invalidated.add(this.draggedDrawableInvalidated);
  }

  private readonly draggedDrawableInvalidated = ([drawable, invalidation]: [Drawable, Invalidation]): void => {
    if ((invalidation & Invalidation.Parent) !== 0) {
      // end drag if no longer rooted.
      if (!isRootedAt(drawable, this.inputManager))
        this.handleDragDrawableEnd();
    }
  };

  private handleDragDrawableEnd(state: InputState | null = null): void {
    const previousDragged = this.draggedDrawable;

    if (previousDragged === null) return;

    previousDragged.invalidated.remove(this.draggedDrawableInvalidated);
    previousDragged.isDragged = false;
    this.draggedDrawable = null;

    if (state !== null)
      this.propagateButtonEvent([previousDragged], new DragEndEvent(state, this.button, this.mouseDownPosition));
  }
}

/** Manages state events for a single key. */
export class KeyEventManager extends ButtonEventManager<Key> {
  handleRepeat(state: InputState): void {
    // Only drawables that can still handle input should handle the repeat
    const queue = this.inputQueue;
    const drawables = this.buttonDownInputQueue!.filter(d => queue.includes(d));

    this.propagateButtonEvent(drawables, new KeyDownEvent(state, this.button, true));
  }

  protected handleButtonDown(state: InputState, targets: Drawable[]): Drawable | null {
    return this.propagateButtonEvent(targets, new KeyDownEvent(state, this.button));
  }

  protected handleButtonUp(state: InputState, targets: Drawable[] | null): void {
    this.propagateButtonEvent(targets ?? [], new KeyUpEvent(state, this.button));
  }
}
