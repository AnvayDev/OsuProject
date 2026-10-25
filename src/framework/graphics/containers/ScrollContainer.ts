// Ported from osu.Framework/Graphics/Containers/ScrollContainer.cs and IScrollContainer.cs
// (DelayedLoadWrapper.IOnScreenOptimisingContainer is a marker interface for an unported class and is omitted.)

import { Cached } from '../../caching/Cached';
import type { KeyBindingPressEvent, KeyBindingReleaseEvent, IKeyBindingHandler } from '../../input/bindings/KeyBindings';
import type { MouseButtonEventManager } from '../../input/ButtonEventManagers';
import type { ClickEvent, DragEndEvent, DragEvent, DragStartEvent, KeyDownEvent, MouseDownEvent, ScrollEvent } from '../../input/events/UIEvents';
import { Key, MouseButton } from '../../input/Key';
import { PlatformAction } from '../../input/PlatformAction';
import { Anchor, Axes, Direction, Invalidation } from '../../layout/Enums';
import { LayoutValueOf } from '../../layout/Layout';
import { MarginPadding } from '../../layout/MarginPadding';
import { Precision } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import { Easing, type IEasingFunction } from '../../transforms/Easing';
import { lerp } from '../../transforms/Interpolation';
import { TransformSequence } from '../../transforms/TransformSequence';
import type { Drawable } from '../Drawable';
import { Container } from './Container';

export interface IScrollContainer {
  /** The direction in which scrolling is supported. */
  readonly scrollDirection: Direction;
}

/** This corresponds to the clamping force. A larger value means more aggressive clamping. Default is 0.012. */
const distance_decay_clamping = 0.012;

export abstract class ScrollContainer<T extends Drawable = Drawable> extends Container<T> implements IScrollContainer, IKeyBindingHandler<PlatformAction> {
  readonly keyBindingActionTypes = [PlatformAction];

  /** Determines whether the scroll dragger appears on the left side. If not, then it always appears on the right side. */
  get scrollbarAnchor(): Anchor {
    return this.scrollbar.anchor;
  }

  set scrollbarAnchor(value: Anchor) {
    this.scrollbar.anchor = value;
    this.scrollbar.origin = value;
    this.updatePadding();
  }

  private _scrollbarVisible = true;

  /** Whether the scrollbar is visible. */
  get scrollbarVisible(): boolean {
    return this._scrollbarVisible;
  }

  set scrollbarVisible(value: boolean) {
    this._scrollbarVisible = value;
    this.scrollbarCache.invalidate();
  }

  protected readonly scrollbar: ScrollbarContainer;

  private _scrollbarOverlapsContent = true;

  /** Whether the scrollbar overlaps the content or resides in its own padded space. */
  get scrollbarOverlapsContent(): boolean {
    return this._scrollbarOverlapsContent;
  }

  set scrollbarOverlapsContent(value: boolean) {
    this._scrollbarOverlapsContent = value;
    this.updatePadding();
  }

  /** Size of available content (i.e. everything that can be scrolled to) in the scroll direction. */
  get availableContent(): number {
    return this.scrollContent.drawSize.get(this.scrollDim);
  }

  /** Size of the viewport in the scroll direction. */
  get displayableContent(): number {
    return this.childSize.get(this.scrollDim);
  }

  /** Controls the distance scrolled per unit of mouse scroll. */
  scrollDistance = 80;

  /**
   * This limits how far out of clamping bounds we allow the target position to be at most.
   * Effectively, larger values result in bouncier behavior as the scroll boundaries are approached with high velocity.
   */
  clampExtension = 500;

  /** Controls the rate with which the target position is approached after ending a drag. Default is 0.0035. */
  distanceDecayDrag = 0.0035;

  /** Controls the rate with which the target position is approached after scrolling. Default is 0.01 */
  distanceDecayScroll = 0.01;

  /** Controls the rate with which the target position is approached after jumping to a specific location. Default is 0.01. */
  distanceDecayJump = 0.01;

  /** Controls the rate with which the target position is approached. It is automatically set after dragging or scrolling. */
  private distanceDecay = 0;

  private _current = 0;

  /** The current scroll position. */
  get current(): number {
    return this._current;
  }

  private _target = 0;

  /** The target scroll position which is exponentially approached by current via a rate of distance decay. When not animating scroll position, this will always be equal to current. */
  get target(): number {
    return this._target;
  }

  /** The maximum distance that can be scrolled in the scroll direction. */
  get scrollableExtent(): number {
    return Math.max(this.availableContent - this.displayableContent, 0);
  }

  /** The maximum distance that the scrollbar can move in the scroll direction. May not be accurate to actual display of scrollbar if toScrollbarPosition or fromScrollbarPosition are overridden. */
  protected get scrollbarMovementExtent(): number {
    return Math.max(this.displayableContent - this.scrollbar.drawSize.get(this.scrollDim), 0);
  }

  /** Clamp a value to the available scroll range. extension: an extension value beyond the normal extent. */
  protected clamp(position: number, extension = 0): number {
    return Math.max(Math.min(position, this.scrollableExtent + extension), -extension);
  }

  protected override get content(): Container<T> {
    return this.scrollContent;
  }

  /** Whether we are currently scrolled to the beginning of content. lenience: how close to the extent we need to be. */
  isScrolledToStart(lenience = Precision.FLOAT_EPSILON): boolean {
    return Precision.almostBigger(0, this._target, lenience);
  }

  /** Whether we are currently scrolled as far as possible into the scroll direction. lenience: how close to the extent we need to be. */
  isScrolledToEnd(lenience = Precision.FLOAT_EPSILON): boolean {
    return Precision.almostBigger(this._target, this.scrollableExtent, lenience);
  }

  /** The container holding all children which are getting scrolled around. */
  readonly scrollContent: Container<T>;

  private _isDragging = false;

  protected get isDragging(): boolean {
    return this._isDragging;
  }

  get isHandlingKeyboardScrolling(): boolean {
    if (this.isHovered)
      return true;

    const inputManager = this.getContainingInputManager();
    return inputManager !== null && this.receivePositionalInputAt(inputManager.currentState.mouse.position);
  }

  readonly scrollDirection: Direction;

  /** The direction in which scrolling is supported, converted to an int for array index lookups. */
  protected get scrollDim(): number {
    return this.scrollDirection === Direction.Horizontal ? 0 : 1;
  }

  private readonly parentScrollContainerCache = new LayoutValueOf<IScrollContainer | null>(Invalidation.Parent);

  private get parentScrollContainer(): IScrollContainer | null {
    return this.parentScrollContainerCache.isValid
      ? this.parentScrollContainerCache.value
      : this.parentScrollContainerCache.value = this.findClosestParent(ScrollContainer);
  }

  /** Creates a scroll container. scrollDirection: the direction in which should be scrolled. Can be vertical or horizontal. Default is vertical. */
  protected constructor(scrollDirection = Direction.Vertical) {
    super();

    this.scrollDirection = scrollDirection;

    this.masking = true;

    const scrollAxis = scrollDirection === Direction.Horizontal ? Axes.X : Axes.Y;
    this.addRangeInternal([
      this.scrollContent = new Container<T>().with({
        relativeSizeAxes: Axes.Both & ~scrollAxis,
        autoSizeAxes: scrollAxis,
      }),
      this.scrollbar = this.createScrollbar(scrollDirection),
    ]);

    this.scrollbar.hide();
    this.scrollbar.dragged = v => this.onScrollbarMovement(v);
    this.scrollbarAnchor = scrollDirection === Direction.Vertical ? Anchor.TopRight : Anchor.BottomLeft;

    this.addLayout(this.parentScrollContainerCache);
  }

  private lastUpdateDisplayableContent = -1;
  private lastAvailableContent = -1;

  private updateSize(): void {
    // ensure we only update scrollbar when something has changed, to avoid transform helpers resetting their transform every frame.
    // also avoids creating many needless Transforms every update frame.
    if (this.lastAvailableContent !== this.availableContent || this.lastUpdateDisplayableContent !== this.displayableContent) {
      this.lastAvailableContent = this.availableContent;
      this.lastUpdateDisplayableContent = this.displayableContent;
      this.scrollbarCache.invalidate();
    }
  }

  private readonly scrollbarCache = new Cached();

  private updatePadding(): void {
    if (this._scrollbarOverlapsContent || !Precision.definitelyBigger(this.availableContent, this.displayableContent, 1))
      this.scrollContent.padding = new MarginPadding();
    else {
      if (this.scrollDirection === Direction.Vertical) {
        this.scrollContent.padding = this.scrollbarAnchor === Anchor.TopLeft
          ? MarginPadding.of({ left: this.scrollbar.width + this.scrollbar.margin.left })
          : MarginPadding.of({ right: this.scrollbar.width + this.scrollbar.margin.right });
      } else {
        this.scrollContent.padding = this.scrollbarAnchor === Anchor.TopLeft
          ? MarginPadding.of({ top: this.scrollbar.height + this.scrollbar.margin.top })
          : MarginPadding.of({ bottom: this.scrollbar.height + this.scrollbar.margin.bottom });
      }
    }
  }

  protected override onDragStart(e: DragStartEvent): boolean {
    if (this.isDragging || e.button !== MouseButton.Left || this.content.aliveInternalChildren.length === 0)
      return false;

    if (this.parentScrollContainer !== null && this.parentScrollContainer.scrollDirection !== this.scrollDirection) {
      const dragWasMostlyHorizontal = Math.abs(e.delta.x) > Math.abs(e.delta.y);
      if (dragWasMostlyHorizontal !== (this.scrollDirection === Direction.Horizontal))
        return false;
    }

    this.lastDragTime = this.time.current;
    this.averageDragDelta = this.averageDragTime = 0;

    this._isDragging = true;

    this.dragButtonManager = this.getContainingInputManager()!.getButtonEventManagerFor(e.button)!;

    return true;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (this.isHandlingKeyboardScrolling && !this.isDragging) {
      switch (e.key) {
        case Key.PageUp:
          this.onUserScroll(this._target - this.displayableContent);
          return true;

        case Key.PageDown:
          this.onUserScroll(this._target + this.displayableContent);
          return true;
      }
    }

    return super.onKeyDown(e);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (this.isDragging || e.button !== MouseButton.Left)
      return false;

    // Continue from where we currently are scrolled to.
    this._target = this._current;
    return false;
  }

  // We keep track of this because input events may happen at different intervals than update frames
  // and we are interested in the time difference between drag _input_ events.
  private lastDragTime = 0;

  // These keep track of a sliding average (w.r.t. time) of the time between drag events
  // and the delta of drag events. Both of these moving averages are decayed at the same
  // rate and thus the velocity remains constant across time. The overall magnitude
  // of averageDragTime and averageDragDelta simple decreases such that more recent movements
  // have a larger weight.
  private averageDragTime = 0;
  private averageDragDelta = 0;

  private dragButtonManager: MouseButtonEventManager | null = null;

  private _dragBlocksClick = false;

  override get dragBlocksClick(): boolean {
    return this._dragBlocksClick;
  }

  protected override onDrag(e: DragEvent): void {
    const currentTime = this.time.current;
    const timeDelta = currentTime - this.lastDragTime;
    const decay = Math.pow(0.95, timeDelta);

    this.averageDragTime = this.averageDragTime * decay + timeDelta;
    this.averageDragDelta = this.averageDragDelta * decay - e.delta.get(this.scrollDim);

    this.lastDragTime = currentTime;

    const childDelta = this.toLocalSpace(e.screenSpaceMousePosition).sub(this.toLocalSpace(e.screenSpaceLastMousePosition));

    let scrollOffset = -childDelta.get(this.scrollDim);
    const clampedScrollOffset = this.clamp(this._target + scrollOffset) - this.clamp(this._target);

    // If we are dragging past the extent of the scrollable area, half the offset
    // such that the user can feel it.
    scrollOffset = clampedScrollOffset + (scrollOffset - clampedScrollOffset) / 2;

    // similar calculation to what is already done in MouseButtonEventManager.HandlePositionChange
    // handles the case where a drag was triggered on an axis we are not interested in.
    // can be removed if/when drag events are split out per axis or contain direction information.
    this._dragBlocksClick ||= Math.abs(e.mouseDownPosition.get(this.scrollDim) - e.mousePosition.get(this.scrollDim)) > this.dragButtonManager!.clickDragDistance;

    this.scrollByOffset(scrollOffset, false);
  }

  protected override onDragEnd(_e: DragEndEvent): void {
    this._dragBlocksClick = false;
    this.dragButtonManager = null;
    this._isDragging = false;

    if (this.averageDragTime <= 0.0)
      return;

    let velocity = this.averageDragDelta / this.averageDragTime;

    // Detect whether we halted at the end of the drag and in fact should _not_
    // perform a flick event.
    const velocity_cutoff = 0.1;
    if (Math.abs(Math.pow(0.95, this.time.current - this.lastDragTime) * velocity) < velocity_cutoff)
      velocity = 0;

    // Differentiate f(t) = distance * (1 - exp(-t)) w.r.t. "t" to obtain
    // velocity w.r.t. time. Then rearrange to solve for distance given velocity.
    const distance = velocity / (1 - Math.exp(-this.distanceDecayDrag));

    this.scrollByOffset(Math.fround(distance), true, this.distanceDecayDrag);
  }

  protected override onScroll(e: ScrollEvent): boolean {
    if (this.content.aliveInternalChildren.length === 0)
      return false;

    if (this.parentScrollContainer !== null && this.parentScrollContainer.scrollDirection !== this.scrollDirection) {
      const scrollWasMostlyHorizontal = Math.abs(e.scrollDelta.x) > Math.abs(e.scrollDelta.y);

      // For horizontal scrolling containers, vertical scroll is also used to perform horizontal traversal.
      // Due to this, we only block horizontal scroll in vertical containers, but not vice-versa.
      if (scrollWasMostlyHorizontal && this.scrollDirection === Direction.Vertical)
        return false;
    }

    const isPrecise = e.isPrecise;

    const scrollDelta = e.scrollDelta;
    let scrollDeltaFloat = scrollDelta.y;
    if (this.scrollDirection === Direction.Horizontal && scrollDelta.x !== 0)
      scrollDeltaFloat = scrollDelta.x;

    this.scrollByOffset(this.scrollDistance * -scrollDeltaFloat, true, isPrecise ? 0.05 : this.distanceDecayScroll);
    return true;
  }

  private onScrollbarMovement(value: number): void {
    this.onUserScroll(this.clamp(this.fromScrollbarPosition(value)), false);
  }

  /** Immediately offsets the current and target scroll position. */
  offsetScrollPosition(offset: number): void {
    this._target += offset;
    this._current += offset;
  }

  private scrollByOffset(value: number, animated: boolean, distanceDecay = Number.POSITIVE_INFINITY): void {
    this.onUserScroll(this._target + value, animated, distanceDecay);
  }

  /** Scroll to the start of available content. allowDuringDrag: whether we should interrupt a user's active drag. */
  scrollToStart(animated = true, allowDuringDrag = false): void {
    if (!this.isDragging || allowDuringDrag)
      this.scrollToInternal(0, animated, this.distanceDecayJump);
  }

  /** Scroll to the end of available content. allowDuringDrag: whether we should interrupt a user's active drag. */
  scrollToEnd(animated = true, allowDuringDrag = false): void {
    if (!this.isDragging || allowDuringDrag)
      this.scrollToInternal(this.scrollableExtent, animated, this.distanceDecayJump);
  }

  /** Scrolls to a new position relative to the current scroll offset. */
  scrollBy(offset: number, animated = true): void {
    this.scrollToInternal(this._target + offset, animated);
  }

  /** Handle a scroll to an absolute position from a user input. distanceDecay defaults to distanceDecayJump. */
  protected onUserScroll(value: number, animated = true, distanceDecay: number | null = null): void {
    this.scrollTo(value, animated, distanceDecay);
  }

  /**
   * Scrolls to an absolute position (distanceDecay defaults to distanceDecayJump),
   * or scrolls a Drawable to the top (C# `ScrollTo(Drawable d, bool animated = true)` overload).
   */
  scrollTo(value: number | Drawable, animated = true, distanceDecay: number | null = null): void {
    if (typeof value !== 'number') {
      this.scrollTo(this.getChildPosInContent(value), animated);
      return;
    }

    this.scrollToInternal(value, animated, distanceDecay ?? this.distanceDecayJump);
  }

  /** C#'s private `scrollTo` (renamed: TS has no case-distinguished overloads). */
  private scrollToInternal(value: number, animated: boolean, distanceDecay = Number.POSITIVE_INFINITY): void {
    this._target = this.clamp(value, this.clampExtension);

    if (animated)
      this.distanceDecay = distanceDecay;
    else
      this._current = this._target;
  }

  /** Scrolls a Drawable into view. */
  scrollIntoView(d: Drawable, animated = true): void {
    const childPos0 = this.getChildPosInContent(d);
    const childPos1 = this.getChildPosInContent(d, d.drawSize);

    const minPos = Math.min(childPos0, childPos1);
    const maxPos = Math.max(childPos0, childPos1);

    if (minPos < this._current || (minPos > this._current && d.drawSize.get(this.scrollDim) > this.displayableContent))
      this.scrollTo(minPos, animated);
    else if (maxPos > this._current + this.displayableContent)
      this.scrollTo(maxPos - this.displayableContent, animated);
  }

  /** Determines the position of a child in the content. offset: positional offset in the child's space. */
  getChildPosInContent(d: Drawable, offset: Vector2 = Vector2.Zero): number {
    return d.toSpaceOfOtherDrawable(offset, this.scrollContent).get(this.scrollDim);
  }

  private updatePosition(): void {
    let localDistanceDecay = this.distanceDecay;

    // If we are not currently dragging the content, and we have scrolled out of bounds,
    // then we should handle the clamping force. Note, that if the target is _within_
    // acceptable bounds, then we do not need special handling of the clamping force, as
    // we will naturally scroll back into acceptable bounds.
    if (!this.isDragging && this._current !== this.clamp(this._current) && this._target !== this.clamp(this._target, Math.fround(-0.01))) {
      // Firstly, we want to limit how far out the target may go to limit overly bouncy
      // behaviour with extreme scroll velocities.
      this._target = this.clamp(this._target, this.clampExtension);

      // Secondly, we would like to quickly approach the target while we are out of bounds.
      // This is simulating a "strong" clamping force towards the target.
      if ((this._current < this._target && this._target < 0) || (this._current > this._target && this._target > this.scrollableExtent))
        localDistanceDecay = distance_decay_clamping * 2;

      // Lastly, we gradually nudge the target towards valid bounds.
      this._target = lerp(this.clamp(this._target), this._target, Math.exp(-distance_decay_clamping * this.time.elapsed));

      const clampedTarget = this.clamp(this._target);
      if (Precision.almostEquals(clampedTarget, this._target, Precision.DOUBLE_EPSILON))
        this._target = clampedTarget;
    }

    // Exponential interpolation between the target and our current scroll position.
    this._current = lerp(this._target, this._current, Math.exp(-localDistanceDecay * this.time.elapsed));

    // This prevents us from entering the de-normalized range of floating point numbers when approaching target closely.
    if (Precision.almostEquals(this._current, this._target, Precision.DOUBLE_EPSILON))
      this._current = this._target;
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    this.updateSize();
    this.updatePosition();

    if (!this.scrollbarCache.isValid) {
      const size = this.scrollDirection === Direction.Horizontal ? this.drawWidth : this.drawHeight;
      if (size > 0) {
        const value = this.availableContent > 0 ? this.displayableContent / this.availableContent : 0;
        this.scrollbar.resizeTo(Math.min(Math.max(value, Math.min(this.scrollbar.minimumDimSize / size, 1)), 1), 200, Easing.OutQuint);
      }
      this.scrollbar.fadeTo(this._scrollbarVisible && Precision.definitelyBigger(this.availableContent, this.displayableContent, 1) ? 1 : 0, 200);
      this.updatePadding();

      this.scrollbarCache.validate();
    }

    if (this.scrollDirection === Direction.Horizontal)
      this.scrollbar.x = this.toScrollbarPosition(this._current);
    else
      this.scrollbar.y = this.toScrollbarPosition(this._current);

    this.applyCurrentToContent();
  }

  /**
   * This is the final internal step of updating the scroll container, which takes current and applies it to scrollContent
   * in order to correctly offset children. Overriding this method can be used to inhibit this default behaviour,
   * to for instance redirect the positioning to another container or change the way it is applied.
   */
  protected applyCurrentToContent(): void {
    if (this.scrollDirection === Direction.Horizontal)
      this.scrollContent.x = -this._current + (this.scrollableExtent * this.scrollContent.relativeAnchorPosition.x);
    else
      this.scrollContent.y = -this._current + (this.scrollableExtent * this.scrollContent.relativeAnchorPosition.y);
  }

  /** Converts a scroll position (e.g. current) to a scrollbar position. */
  protected toScrollbarPosition(scrollPosition: number): number {
    if (Precision.almostEquals(0, this.scrollableExtent, Precision.DOUBLE_EPSILON))
      return 0;

    return this.scrollbarMovementExtent * (scrollPosition / this.scrollableExtent);
  }

  /** Converts a scrollbar position to an absolute scroll position. */
  protected fromScrollbarPosition(scrollbarPosition: number): number {
    if (Precision.almostEquals(0, this.scrollbarMovementExtent, Precision.DOUBLE_EPSILON))
      return 0;

    return this.scrollableExtent * (scrollbarPosition / this.scrollbarMovementExtent);
  }

  /** Creates the scrollbar for this ScrollContainer. */
  protected abstract createScrollbar(direction: Direction): ScrollbarContainer;

  onPressed(e: KeyBindingPressEvent<PlatformAction>): boolean {
    if (!this.isHandlingKeyboardScrolling)
      return false;

    switch (e.action) {
      case PlatformAction.MoveBackwardLine:
        this.scrollToStart();
        return true;

      case PlatformAction.MoveForwardLine:
        this.scrollToEnd();
        return true;

      default:
        return false;
    }
  }

  onReleased(_e: KeyBindingReleaseEvent<PlatformAction>): void {
  }
}

export abstract class ScrollbarContainer extends Container {
  private dragOffset = 0;

  /** @internal */ dragged: ((value: number) => void) | null = null;

  protected readonly scrollDirection: Direction;

  /** The minimum size of this ScrollbarContainer. Defaults to the size in the non-scrolling direction. */
  get minimumDimSize(): number {
    return this.size.get(this.scrollDirection === Direction.Vertical ? 0 : 1);
  }

  protected constructor(direction: Direction) {
    super();

    this.scrollDirection = direction;

    this.relativeSizeAxes = direction === Direction.Horizontal ? Axes.X : Axes.Y;
  }

  /**
   * C# declares `abstract void ResizeTo(float val, int duration = 0, Easing easing = Easing.None)`, which takes precedence over the
   * ResizeTo extension for a float argument. TS has one `resizeTo`: numbers go to resizeScrollbarTo, a Vector2 to the Drawable transform.
   */
  override resizeTo(val: number | Vector2, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    if (typeof val !== 'number')
      return super.resizeTo(val, duration, easing);

    this.resizeScrollbarTo(val, duration, easing as Easing);
    // The C# method returns void; an empty sequence keeps the Drawable signature.
    return new TransformSequence(this);
  }

  /** The C# `ResizeTo(float val, int duration, Easing easing)` override point. */
  protected abstract resizeScrollbarTo(val: number, duration: number, easing: Easing): void;

  protected override onClick(_e: ClickEvent): boolean {
    return true;
  }

  protected override onDragStart(e: DragStartEvent): boolean {
    if (e.button !== MouseButton.Left) return false;

    this.dragOffset = e.mousePosition.get(this.scrollDirection) - this.position.get(this.scrollDirection);
    return true;
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (e.button !== MouseButton.Left) return false;

    this.dragOffset = this.position.get(this.scrollDirection);
    this.dragged?.(this.dragOffset);
    return true;
  }

  protected override onDrag(e: DragEvent): void {
    this.dragged?.(e.mousePosition.get(this.scrollDirection) - this.dragOffset);
  }
}
