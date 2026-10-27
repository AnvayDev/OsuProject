// Ported from osu.Game/Graphics/Containers/OsuScrollContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { ScrollContainer, ScrollbarContainer } from '@fw/graphics/containers/ScrollContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent, ScrollEvent } from '@fw/input/events/UIEvents';
import { MouseButton } from '@fw/input/Key';
import { Axes, Direction } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { Easing } from '@fw/transforms/Easing';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuColour } from '../OsuColour';

export class OsuScrollContainer<T extends Drawable = Drawable> extends ScrollContainer<T> {
  static readonly SCROLL_BAR_WIDTH = 10;
  static readonly SCROLL_BAR_PADDING = 3;

  constructor(scrollDirection = Direction.Vertical) {
    super(scrollDirection);
  }

  /**
   * Scrolls a Drawable into view.
   * @param extraScroll An added amount to scroll beyond the requirement to bring the target into view.
   */
  override scrollIntoView(d: Drawable, animated = true, extraScroll = 0): void {
    const childPos0 = this.getChildPosInContent(d);
    const childPos1 = this.getChildPosInContent(d, d.drawSize);

    const minPos = Math.min(childPos0, childPos1);
    const maxPos = Math.max(childPos0, childPos1);

    if (minPos < this.current || (minPos > this.current && d.drawSize.get(this.scrollDim) > this.displayableContent))
      this.scrollTo(minPos - extraScroll, animated);
    else if (maxPos > this.current + this.displayableContent)
      this.scrollTo(maxPos - this.displayableContent + extraScroll, animated);
  }

  protected override onScroll(e: ScrollEvent): boolean {
    // allow for controlling volume when alt is held.
    // mostly for compatibility with osu-stable.
    if (e.altPressed) return false;

    return super.onScroll(e);
  }

  // #region Absolute scrolling

  /** Controls the rate with which the target position is approached when performing a relative drag. Default is 0.02. */
  distanceDecayOnAbsoluteScroll = 0.02;

  protected scrollToAbsolutePosition(screenSpacePosition: Vector2): void {
    const fromScrollbarPosition = this.fromScrollbarPosition(this.toLocalSpace(screenSpacePosition).get(this.scrollDim));
    const scrollbarCentreOffset = Math.fround(this.fromScrollbarPosition(this.scrollbar.drawHeight) * 0.5);

    this.scrollTo(this.clamp(fromScrollbarPosition - scrollbarCentreOffset), true, this.distanceDecayOnAbsoluteScroll);
  }

  // #endregion

  protected override createScrollbar(direction: Direction): ScrollbarContainer {
    return new OsuScrollbar(direction);
  }
}

export class OsuScrollbar extends ScrollbarContainer {
  private hoverColour = Colour4.White;
  private defaultColour = Colour4.White;
  private highlightColour = Colour4.White;

  private readonly box: Box;

  override get minimumDimSize(): number {
    return OsuScrollContainer.SCROLL_BAR_WIDTH * 3;
  }

  constructor(scrollDir: Direction) {
    super(scrollDir);

    this.blending = BlendingParameters.Additive;
    this.cornerRadius = 5;

    // needs to be set initially for the ResizeTo to respect minimum size
    this.size = new Vector2(OsuScrollContainer.SCROLL_BAR_WIDTH);

    const margin = 3;

    this.margin = MarginPadding.of({
      left: scrollDir === Direction.Vertical ? margin : 0,
      right: scrollDir === Direction.Vertical ? margin : 0,
      top: scrollDir === Direction.Horizontal ? margin : 0,
      bottom: scrollDir === Direction.Horizontal ? margin : 0,
    });

    this.masking = true;
    this.child = this.box = new Box().with({ relativeSizeAxes: Axes.Both });
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    this.colour = this.defaultColour = colours.gray8;
    this.hoverColour = colours.grayF;
    this.highlightColour = dependencies.get(OverlayColourProvider)?.highlight1 ?? colours.green;

    return r;
  }

  protected override resizeScrollbarTo(val: number, duration = 0, easing?: Easing): void {
    const size = this.scrollDirection === Direction.Vertical
      ? new Vector2(OsuScrollContainer.SCROLL_BAR_WIDTH, val)
      : new Vector2(val, OsuScrollContainer.SCROLL_BAR_WIDTH);

    this.resizeTo(size, duration, easing);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.fadeColour(this.hoverColour, 100);
    return true;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.fadeColour(this.defaultColour, 100);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (!super.onMouseDown(e)) return false;

    // note that we are changing the colour of the box here as to not interfere with the hover effect.
    this.box.fadeColour(this.highlightColour, 100);
    return true;
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    if (e.button !== MouseButton.Left) return;

    this.box.fadeColour(Colour4.White, 100);
    super.onMouseUp(e);
  }
}
