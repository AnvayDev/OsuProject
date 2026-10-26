// Ported from osu.Game/Graphics/Carousel/Carousel.ScrollContainer.cs (Carousel<T>.ScrollContainer)
// Context menus aren't ported, so a right mouse press always starts absolute scrolling (C# skips it when a hovered drawable has a context
// menu; every carousel panel has one, so in C# right-click absolute scrolling only starts outside panels).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { ScrollbarContainer } from '@fw/graphics/containers/ScrollContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Circle } from '@fw/graphics/shapes/Circle';
import type { KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { DragEndEvent, HoverEvent, HoverLostEvent, KeyDownEvent, MouseDownEvent, MouseEvent, MouseMoveEvent, MouseUpEvent, UIEvent } from '@fw/input/events/UIEvents';
import { Key, MouseButton } from '@fw/input/Key';
import { PlatformAction } from '@fw/input/PlatformAction';
import { Anchor, Axes, Direction } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Precision } from '@fw/layout/Primitives';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuScrollContainer } from '../containers/OsuScrollContainer';
import { UserTrackingScrollContainer } from '../containers/UserTrackingScrollContainer';
import { OsuColour } from '../OsuColour';
import { isCarouselPanel } from './CarouselItem';

const expanded_size_ratio = 2;

class ScrollBar extends ScrollbarContainer {
  private hoverColour = Colour4.White;
  private defaultColour = Colour4.White;
  private highlightColour = Colour4.White;

  private readonly box: Drawable;

  private capturingMouseDown = false;

  override get minimumDimSize(): number {
    return OsuScrollContainer.SCROLL_BAR_WIDTH * 3;
  }

  constructor() {
    super(Direction.Vertical);

    this.blending = BlendingParameters.Additive;

    // needs to be set initially for the ResizeTo to respect minimum size
    this.size = new Vector2(OsuScrollContainer.SCROLL_BAR_WIDTH * expanded_size_ratio, OsuScrollContainer.SCROLL_BAR_WIDTH);

    const margin = 3;

    this.margin = MarginPadding.of({
      left: margin,
      right: margin,
    });

    this.child = this.box = new Circle().with({
      anchor: Anchor.TopRight,
      origin: Anchor.TopRight,
      relativeSizeAxes: Axes.Both,
      width: 1 / expanded_size_ratio,
    });
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    this.colour = this.defaultColour = colours.gray8;
    this.hoverColour = colours.grayF;
    this.highlightColour = dependencies.get(OverlayColourProvider)?.highlight1 ?? colours.green;

    return r;
  }

  protected override resizeScrollbarTo(val: number, duration = 0, easing = Easing.None): void {
    this.resizeTo(new Vector2(OsuScrollContainer.SCROLL_BAR_WIDTH * expanded_size_ratio, val), duration, easing);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateVisuals(e);
    return true;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateVisuals(e);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (!super.onMouseDown(e)) return false;

    this.capturingMouseDown = true;
    this.updateVisuals(e);
    return true;
  }

  protected override onDragEnd(e: DragEndEvent): void {
    this.updateVisuals(e);
    super.onDragEnd(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (e.button !== MouseButton.Left) return;

    this.capturingMouseDown = false;
    this.updateVisuals(e);
    super.onMouseUp(e);
  }

  private updateVisuals(_e: MouseEvent): void {
    if (this.capturingMouseDown)
      this.box.fadeColour(this.highlightColour, 100);
    else if (this.isHovered)
      this.box.fadeColour(this.hoverColour, 100);
    else
      this.box.fadeColour(this.defaultColour, 100);

    if (this.isHovered || this.isDragged)
      this.box.resizeWidthTo(1, 300, Easing.OutElasticHalf);
    else
      this.box.resizeWidthTo(1 / expanded_size_ratio, 200, Easing.OutQuint);
  }
}

/** Implementation of scroll container which handles very large vertical lists by internally using double precision for pre-display Y values. */
export class CarouselScrollContainer extends UserTrackingScrollContainer {
  override readonly keyBindingActionTypes = [PlatformAction, GlobalAction];

  onPageUp: (() => void) | null = null;
  onPageDown: (() => void) | null = null;
  onListStart: (() => void) | null = null;
  onListEnd: (() => void) | null = null;

  readonly panels: Container;

  setLayoutHeight(height: number): void {
    this.panels.height = height;
  }

  protected override createScrollbar(_direction: Direction): ScrollbarContainer {
    return new ScrollBar();
  }

  /** Allow handling right click scroll outside of the carousel's display area. */
  override receivePositionalInputAt(_screenSpacePos: Vector2): boolean {
    return true;
  }

  constructor() {
    super();

    // Managing our own custom layout within ScrollContent causes feedback with public ScrollContainer calculations,
    // so we must maintain one level of separation from ScrollContent.
    let panels!: Container;
    super.add(panels = new Container().with({
      relativeSizeAxes: Axes.X,
    }));
    this.panels = panels;
  }

  override offsetScrollPosition(offset: number): void {
    super.offsetScrollPosition(offset);

    for (const panel of this.panels.children) {
      if (isCarouselPanel(panel))
        panel.drawYPosition += offset;
    }
  }

  override clear(disposeChildren = true): void {
    this.panels.height = 0;
    this.panels.clear(disposeChildren);
  }

  override add(drawable: Drawable): void {
    if (!isCarouselPanel(drawable))
      throw new Error('Carousel panel drawables must implement ICarouselPanel');

    this.panels.add(drawable);
  }

  override getChildPosInContent(d: Drawable, offset: Vector2 = Vector2.Zero): number {
    if (!isCarouselPanel(d))
      return super.getChildPosInContent(d, offset);

    return d.drawYPosition + offset.x;
  }

  protected override applyCurrentToContent(): void {
    const scrollableExtent = -this.current + this.scrollableExtent * this.scrollContent.relativeAnchorPosition.y;

    for (const d of this.panels.children) {
      if (isCarouselPanel(d))
        d.y = Math.fround(d.drawYPosition + scrollableExtent);
    }
  }

  // #region Scrollbar padding

  scrollbarPaddingTop = 5;
  scrollbarPaddingBottom = 5;

  protected override toScrollbarPosition(scrollPosition: number): number {
    if (Precision.almostEquals(0, this.scrollableExtent))
      return 0;

    return Math.fround(this.scrollbarPaddingTop + (this.scrollbarMovementExtent - (this.scrollbarPaddingTop + this.scrollbarPaddingBottom)) * (scrollPosition / this.scrollableExtent));
  }

  protected override fromScrollbarPosition(scrollbarPosition: number): number {
    if (Precision.almostEquals(0, this.scrollbarMovementExtent))
      return 0;

    return Math.fround(this.scrollableExtent * ((scrollbarPosition - this.scrollbarPaddingTop) / (this.scrollbarMovementExtent - (this.scrollbarPaddingTop + this.scrollbarPaddingBottom))));
  }

  // #endregion

  // #region Absolute scrolling

  private _absoluteScrolling = false;

  /** Whether absolute scrolling is currently triggered. */
  get absoluteScrolling(): boolean {
    return this._absoluteScrolling;
  }

  protected override get isDragging(): boolean {
    return super.isDragging || this._absoluteScrolling;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    switch (e.key) {
      case Key.PageUp:
        this.onPageUp?.();
        return true;

      case Key.PageDown:
        this.onPageDown?.();
        return true;
    }

    return super.onKeyDown(e);
  }

  override onPressed(e: KeyBindingPressEvent<PlatformAction | GlobalAction>): boolean {
    if (e.actionType === GlobalAction) {
      switch (e.action as GlobalAction) {
        case GlobalAction.AbsoluteScrollSongList:
          this.beginAbsoluteScrolling(e);
          return true;
      }

      return false;
    }

    if (this.isHandlingKeyboardScrolling) {
      switch (e.action as PlatformAction) {
        case PlatformAction.MoveBackwardLine:
          this.onListStart?.();
          return true;

        case PlatformAction.MoveForwardLine:
          this.onListEnd?.();
          return true;
      }
    }

    return super.onPressed(e as KeyBindingPressEvent<PlatformAction>);
  }

  override onReleased(e: KeyBindingReleaseEvent<PlatformAction | GlobalAction>): void {
    if (e.actionType === GlobalAction) {
      switch (e.action as GlobalAction) {
        case GlobalAction.AbsoluteScrollSongList:
          this.endAbsoluteScrolling();
          break;
      }

      return;
    }

    super.onReleased(e as KeyBindingReleaseEvent<PlatformAction>);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (e.button === MouseButton.Right)
      this.beginAbsoluteScrolling(e);

    return super.onMouseDown(e);
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (e.button === MouseButton.Right)
      this.endAbsoluteScrolling();

    super.onMouseUp(e);
  }

  protected override onMouseMove(e: MouseMoveEvent): boolean {
    if (this._absoluteScrolling) {
      this.scrollToAbsolutePosition(e.currentState.mouse.position);
      return true;
    }

    return super.onMouseMove(e);
  }

  private beginAbsoluteScrolling(e: UIEvent): void {
    this.scrollToAbsolutePosition(e.currentState.mouse.position);
    this._absoluteScrolling = true;
  }

  private endAbsoluteScrolling(): void {
    this._absoluteScrolling = false;
  }

  // #endregion
}
