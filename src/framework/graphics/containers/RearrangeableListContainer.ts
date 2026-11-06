// Ported from osu.Framework/Graphics/Containers/RearrangeableListContainer.cs
// The item map is keyed by model reference (C#'s Dictionary uses the model's equality; the models used here are stored by instance).

import { BindableList, NotifyCollectionChangedAction, type NotifyCollectionChangedEvent } from '../../bindables/BindableList';
import { Axes, FillDirection } from '../../layout/Enums';
import { Vector2 } from '../../layout/Vector2';
import type { DragEndEvent, DragEvent, DragStartEvent } from '../../input/events/UIEvents';
import type { Drawable } from '../Drawable';
import { CompositeDrawable } from './CompositeDrawable';
import { FillFlowContainer } from './FillFlowContainer';
import type { RearrangeableListItem } from './RearrangeableListItem';
import type { ScrollContainer } from './ScrollContainer';

const exp_base = Math.fround(1.05);

/** A list container that enables its children to be rearranged via dragging. Adding duplicate items is not currently supported. */
export abstract class RearrangeableListContainer<TModel> extends CompositeDrawable {
  /** The items contained by this RearrangeableListContainer, in the order they are arranged. */
  readonly items = new BindableList<TModel>();

  /** The maximum exponent of the automatic scroll speed at the boundaries of this RearrangeableListContainer. */
  protected maxExponent = 50;

  /** The ScrollContainer containing the flow of items. */
  protected readonly scrollContainer: ScrollContainer<Drawable>;

  /** The FillFlowContainer containing of all the RearrangeableListItems. */
  protected readonly listContainer: FillFlowContainer<RearrangeableListItem<TModel>>;

  /** The mapping of TModel to RearrangeableListItem. */
  protected get itemMap(): ReadonlyMap<TModel, RearrangeableListItem<TModel>> {
    return this._itemMap;
  }

  private readonly _itemMap = new Map<TModel, RearrangeableListItem<TModel>>();
  private currentlyDraggedItem: RearrangeableListItem<TModel> | null = null;
  private screenSpaceDragPosition = Vector2.Zero;

  protected constructor() {
    super();

    this.listContainer = this.createListFillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
    });

    this.internalChild = this.scrollContainer = this.createScrollContainer().with({
      relativeSizeAxes: Axes.Both,
      child: this.listContainer,
    });

    this.items.collectionChanged.add(this.collectionChanged);
  }

  /** Fired whenever new drawable items are added or removed from listContainer. */
  protected onItemsChanged(): void {
  }

  private readonly collectionChanged = (_: BindableList<TModel>, e: NotifyCollectionChangedEvent<TModel>): void => {
    switch (e.action) {
      case NotifyCollectionChangedAction.Add:
        this.addItems(e.newItems ?? []);
        break;

      case NotifyCollectionChangedAction.Remove:
        this.removeItems(e.oldItems ?? []);

        // Explicitly reset scroll position here so that ScrollContainer doesn't retain our
        // scroll position if we quickly add new items after calling a Clear().
        if (this.items.count === 0)
          this.scrollContainer.scrollToStart();
        break;

      case NotifyCollectionChangedAction.Reset:
        this.currentlyDraggedItem = null;
        this.listContainer.clear();
        this._itemMap.clear();
        this.onItemsChanged();
        break;

      case NotifyCollectionChangedAction.Replace: {
        const tOldItems = e.oldItems ?? [];
        const tNewItems = e.newItems ?? [];

        this.removeItems(tOldItems.filter(i => !tNewItems.includes(i)));
        this.addItems(tNewItems.filter(i => !tOldItems.includes(i)));
        break;
      }

      case NotifyCollectionChangedAction.Move:
        this.sortItems();
        this.onItemsChanged();
        break;
    }
  };

  private removeItems(items: Iterable<TModel>): void {
    for (const item of items) {
      if (this.currentlyDraggedItem !== null && this.currentlyDraggedItem.model === item)
        this.currentlyDraggedItem = null;

      const drawableItem = this._itemMap.get(item)!;

      this.listContainer.remove(drawableItem, false);
      this.disposeChildAsync(drawableItem);

      this._itemMap.delete(item);
    }

    this.sortItems();
    this.onItemsChanged();
  }

  private addItems(items: Iterable<TModel>): void {
    const drawablesToAdd: RearrangeableListItem<TModel>[] = [];

    for (const item of items) {
      if (this._itemMap.has(item))
        throw new Error('Duplicate items cannot be added to a BindableList that is currently bound with a RearrangeableListContainer.');

      const drawable = this.createDrawable(item).with({
        startArrangement: this.startArrangement,
        arrange: this.arrange,
        endArrangement: this.endArrangement,
      });

      drawablesToAdd.push(drawable);
      this._itemMap.set(item, drawable);
    }

    const addToHierarchy = (drawables: RearrangeableListItem<TModel>[]) => {
      for (const d of drawables) {
        // Don't add drawables whose models were removed during the async load, or drawables that are no longer attached to the contained model.
        if (this._itemMap.get(d.model) === d)
          this.listContainer.add(d);
      }

      this.sortItems();
      this.onItemsChanged();
    };

    if (!this.isLoaded)
      addToHierarchy(drawablesToAdd);
    else
      void this.loadComponentsAsync(drawablesToAdd, addToHierarchy);
  }

  private sortItems(): void {
    for (let i = 0; i < this.items.count; i++) {
      // A drawable for the item may not exist yet, for example in a replace-range operation where the removal happens first.
      const drawable = this._itemMap.get(this.items.get(i));
      if (drawable === undefined)
        continue;

      // The item may not be loaded yet, because add operations are asynchronous.
      if (drawable.parent !== this.listContainer)
        continue;

      this.listContainer.setLayoutPosition(drawable, i);
    }
  }

  private readonly startArrangement = (item: RearrangeableListItem<TModel>, e: DragStartEvent): void => {
    this.currentlyDraggedItem = item;
    this.screenSpaceDragPosition = e.screenSpaceMousePosition;
  };

  private readonly arrange = (_item: RearrangeableListItem<TModel>, e: DragEvent): void => {
    this.screenSpaceDragPosition = e.screenSpaceMousePosition;
  };

  private readonly endArrangement = (_item: RearrangeableListItem<TModel>, _e: DragEndEvent): void => {
    this.currentlyDraggedItem = null;
  };

  protected override update(): void {
    super.update();

    if (this.currentlyDraggedItem !== null)
      this.updateScrollPosition();
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();
    this.updateArrangement();
  }

  private updateScrollPosition(): void {
    const localPos = this.scrollContainer.toLocalSpace(this.screenSpaceDragPosition);
    let scrollSpeed = 0;

    if (localPos.y < 0) {
      const power = Math.min(this.maxExponent, Math.abs(localPos.y));
      scrollSpeed = Math.fround(-Math.fround(Math.pow(exp_base, power)) * this.clock!.elapsedFrameTime * 0.1);
    } else if (localPos.y > this.scrollContainer.drawHeight) {
      const power = Math.min(this.maxExponent, Math.abs(this.scrollContainer.drawHeight - localPos.y));
      scrollSpeed = Math.fround(Math.fround(Math.pow(exp_base, power)) * this.clock!.elapsedFrameTime * 0.1);
    }

    if ((scrollSpeed < 0 && !this.scrollContainer.isScrolledToStart()) || (scrollSpeed > 0 && !this.scrollContainer.isScrolledToEnd()))
      this.scrollContainer.scrollBy(scrollSpeed);
  }

  private updateArrangement(): void {
    if (this.currentlyDraggedItem === null)
      return;

    const localPos = this.listContainer.toLocalSpace(this.screenSpaceDragPosition);
    const srcIndex = this.items.indexOf(this.currentlyDraggedItem.model);

    // Find the last item with position < mouse position. Note we can't directly use
    // the item positions as they are being transformed
    let heightAccumulator = 0;
    let dstIndex = 0;

    for (; dstIndex < this.items.count; dstIndex++) {
      const drawable = this._itemMap.get(this.items.get(dstIndex))!;

      if (!drawable.isLoaded || !drawable.isPresent)
        continue;

      // Using BoundingBox here takes care of scale, paddings, etc...
      const height = drawable.boundingBox.height;

      // Rearrangement should occur only after the mid-point of items is crossed
      heightAccumulator += height / 2;

      // Check if the midpoint has been crossed (i.e. cursor is located above the midpoint)
      if (heightAccumulator > localPos.y) {
        if (dstIndex > srcIndex) {
          // Suppose an item is dragged just slightly below its own midpoint. The rearrangement condition (accumulator > pos) will be satisfied for the next immediate item
          // but not the currently-dragged item, which will invoke a rearrangement. This is an off-by-one condition.
          // Rearrangement should not occur until the midpoint of the next item is crossed, and so to fix this the next item's index is discarded.
          dstIndex--;
        }

        break;
      }

      // Add the remainder of the height of the current item
      heightAccumulator += height / 2 + this.listContainer.spacing.y;
    }

    dstIndex = Math.min(Math.max(dstIndex, 0), this.items.count - 1);

    if (srcIndex === dstIndex)
      return;

    this.items.move(srcIndex, dstIndex);

    // Todo: this could be optimised, but it's a very simple iteration over all the items
    this.sortItems();
  }

  /** Creates the FillFlowContainer for the items. */
  protected createListFillFlowContainer(): FillFlowContainer<RearrangeableListItem<TModel>> {
    return new FillFlowContainer<RearrangeableListItem<TModel>>();
  }

  /** Creates the ScrollContainer for the list of items. */
  protected abstract createScrollContainer(): ScrollContainer<Drawable>;

  /** Creates the Drawable representation of an item. */
  protected abstract createDrawable(item: TModel): RearrangeableListItem<TModel>;
}
