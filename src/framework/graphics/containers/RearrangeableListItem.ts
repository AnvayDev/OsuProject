// Ported from osu.Framework/Graphics/Containers/RearrangeableListItem.cs

import type { DragEndEvent, DragEvent, DragStartEvent } from '../../input/events/UIEvents';
import type { Vector2 } from '../../layout/Vector2';
import { CompositeDrawable } from './CompositeDrawable';

/** An item of a RearrangeableListContainer. */
export abstract class RearrangeableListItem<TModel> extends CompositeDrawable {
  /** (internal) Invoked on drag start, if an arrangement should be started. */
  startArrangement: ((item: RearrangeableListItem<TModel>, e: DragStartEvent) => void) | null = null;

  /** (internal) Invoked on drag, if this item is being arranged. */
  arrange: ((item: RearrangeableListItem<TModel>, e: DragEvent) => void) | null = null;

  /** (internal) Invoked on drag end, if this item is being arranged. */
  endArrangement: ((item: RearrangeableListItem<TModel>, e: DragEndEvent) => void) | null = null;

  /** The item this RearrangeableListItem represents. */
  readonly model: TModel;

  protected constructor(item: TModel) {
    super();

    this.model = item;
  }

  /** Whether the item is able to be dragged at the given screen-space position. */
  protected isDraggableAt(_screenSpacePos: Vector2): boolean {
    return true;
  }

  protected override onDragStart(e: DragStartEvent): boolean {
    if (this.isDraggableAt(e.screenSpaceMouseDownPosition)) {
      this.startArrangement?.(this, e);
      return true;
    }

    return false;
  }

  protected override onDrag(e: DragEvent): void {
    this.arrange?.(this, e);
  }

  protected override onDragEnd(e: DragEndEvent): void {
    this.endArrangement?.(this, e);
  }
}
