// Ported from osu.Game/Beatmaps/Drawables/Cards/ExpandedContentScrollContainer.cs

import type { ScrollbarContainer } from '@fw/graphics/containers/ScrollContainer';
import type { ClickEvent, DragEndEvent, DragEvent, DragStartEvent, HoverEvent, ScrollEvent } from '@fw/input/events/UIEvents';
import type { Direction } from '@fw/layout/Enums';
import { Precision } from '@fw/layout/Primitives';
import { OsuScrollbar, OsuScrollContainer } from '../../../graphics/containers/OsuScrollContainer';

export class ExpandedContentScrollContainer extends OsuScrollContainer {
  static readonly HEIGHT = 200;

  protected override createScrollbar(direction: Direction): ScrollbarContainer {
    return new ExpandedContentScrollbar(direction);
  }

  protected override update(): void {
    super.update();

    this.height = Math.min(this.content.drawHeight, ExpandedContentScrollContainer.HEIGHT);
    this.scrollbarVisible = this.allowScroll;
  }

  private get allowScroll(): boolean {
    return !Precision.almostEqualsVector(this.drawSize, this.content.drawSize);
  }

  protected override onDragStart(e: DragStartEvent): boolean {
    if (!this.allowScroll)
      return false;

    return super.onDragStart(e);
  }

  protected override onDrag(e: DragEvent): void {
    if (!this.allowScroll)
      return;

    super.onDrag(e);
  }

  protected override onDragEnd(e: DragEndEvent): void {
    if (!this.allowScroll)
      return;

    super.onDragEnd(e);
  }

  protected override onScroll(e: ScrollEvent): boolean {
    if (!this.allowScroll)
      return false;

    return super.onScroll(e);
  }

  protected override onClick(_e: ClickEvent): boolean {
    return true;
  }
}

/** (ExpandedContentScrollContainer.ExpandedContentScrollbar) */
class ExpandedContentScrollbar extends OsuScrollbar {
  protected override onHover(e: HoverEvent): boolean {
    super.onHover(e);

    // do not handle hover, as handling hover would make the beatmap card's expanded content not-hovered
    // and therefore cause it to hide when trying to drag the scroll bar.
    // see: `BeatmapCardContent.dropdownContent` and its `Unhovered` handler.
    return false;
  }
}
