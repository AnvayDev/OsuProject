// Ported from osu.Framework/Graphics/Containers/VirtualisedListContainer.cs
// C#'s `where TDrawable : PoolableDrawable, IHasCurrentValue<TData>, new()` becomes a constructor argument (as for DrawablePool).
// assertCorrectOrder ([Conditional("DEBUG")]) is left out.

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import type { Bindable } from '../../bindables/Bindable';
import { BindableList, type NotifyCollectionChangedEvent, NotifyCollectionChangedAction } from '../../bindables/BindableList';
import { Cached } from '../../caching/Cached';
import { Axes } from '../../layout/Enums';
import { DrawablePool } from '../pooling/DrawablePool';
import type { PoolableDrawable } from '../pooling/PoolableDrawable';
import { CompositeDrawable } from './CompositeDrawable';
import { Container } from './Container';
import type { ScrollContainer } from './ScrollContainer';
import type { Drawable } from '../Drawable';

type RowDrawable<TData> = PoolableDrawable & { current: Bindable<TData> };

/**
 * This class is an alternative to combined ScrollContainer / FlowContainer usage for large lists (think thousands of items).
 * This class efficiently handles collection change events, as well as applies pooling to only allocate drawables for what is actually visible
 * on screen.
 * The trade-off is that every row has to have an estimated or fixed height so that layout can be estimated cheaply pre-emptively.
 */
export abstract class VirtualisedListContainer<TData, TDrawable extends RowDrawable<TData>> extends CompositeDrawable {
  readonly rowData = new BindableList<TData>();

  private _scroll!: ScrollContainer<Drawable>;

  protected get scroll(): ScrollContainer<Drawable> {
    return this._scroll;
  }

  private _items!: ItemFlow<TData, TDrawable>;

  protected get items(): ItemFlow<TData, TDrawable> {
    return this._items;
  }

  private visibleRange: [number, number] = [0, 0];
  private readonly visibilityCache = new Cached();

  private pool!: DrawablePool<TDrawable>;

  protected constructor(private readonly drawableType: new () => TDrawable, private readonly rowHeight: number, private readonly initialPoolSize: number) {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.pool = new DrawablePool(this.drawableType, this.initialPoolSize);

    const scroll = this.createScrollContainer();
    scroll.relativeSizeAxes = Axes.Both;
    scroll.child = this._items = new ItemFlow<TData, TDrawable>(this.pool, this.rowHeight).with({
      relativeSizeAxes: Axes.X,
    });

    this.internalChildren = [
      this.pool,
      this._scroll = scroll,
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.rowData.bindCollectionChanged((_, e) => this.itemsChanged(e), true);
  }

  private itemsChanged(e: NotifyCollectionChangedEvent<TData>): void {
    this.visibilityCache.invalidate();
    this._items.height = this.rowHeight * this.rowData.count;

    const items = [...this._items.flowingChildren];

    switch (e.action) {
      case NotifyCollectionChangedAction.Add: {
        const newItems = e.newItems!;

        if (e.newStartingIndex >= 0) {
          for (let i = e.newStartingIndex; i < items.length; ++i)
            this._items.move(items[i], i + newItems.length);
        }

        for (let i = 0; i < newItems.length; ++i)
          this._items.insert(newItems[i], Math.max(e.newStartingIndex, 0) + i);

        break;
      }

      case NotifyCollectionChangedAction.Remove: {
        const oldItems = e.oldItems!;

        for (let i = 0; i < oldItems.length; ++i)
          this._items.removeRow(items[e.oldStartingIndex + i]);

        for (let i = e.oldStartingIndex + oldItems.length; i < items.length; ++i)
          this._items.move(items[i], i - oldItems.length);

        break;
      }

      case NotifyCollectionChangedAction.Replace: {
        this._items.children[e.oldStartingIndex].row = e.newItems![0];
        break;
      }

      case NotifyCollectionChangedAction.Move: {
        const allMoves: [ItemRow<TData, TDrawable>, number][] = [];

        for (let i = Math.min(e.oldStartingIndex, e.newStartingIndex); i <= Math.max(e.oldStartingIndex, e.newStartingIndex); ++i) {
          if (i === e.oldStartingIndex)
            allMoves.push([items[i], e.newStartingIndex]);
          else if (e.newStartingIndex < e.oldStartingIndex)
            allMoves.push([items[i], i + 1]);
          else
            allMoves.push([items[i], i - 1]);
        }

        for (const [item, newPosition] of allMoves)
          this._items.move(item, newPosition);

        break;
      }

      case NotifyCollectionChangedAction.Reset: {
        this._items.clear();
        break;
      }
    }
  }

  protected override update(): void {
    super.update();

    const currentVisibleRange: [number, number] = [
      Math.trunc(this._scroll.current / this.rowHeight),
      Math.trunc((this._scroll.current + this._scroll.drawHeight) / this.rowHeight) + 1,
    ];

    if (currentVisibleRange[0] !== this.visibleRange[0] || currentVisibleRange[1] !== this.visibleRange[1]) {
      this.visibilityCache.invalidate();
      this.visibleRange = currentVisibleRange;
    }

    if (!this.visibilityCache.isValid) {
      for (const row of this._items.children) {
        if (!row.isPresent)
          continue;

        const rowTop = row.y;
        const rowBottom = rowTop + this.rowHeight;

        if (rowTop < this.visibleRange[0] * this.rowHeight || rowBottom > this.visibleRange[1] * this.rowHeight) {
          if (row.visible)
            row.unloadRow();
        } else {
          if (!row.visible)
            row.loadRow();
        }
      }

      this.visibilityCache.validate();
    }
  }

  protected abstract createScrollContainer(): ScrollContainer<Drawable>;
}

/** (VirtualisedListContainer.ItemFlow) */
export class ItemFlow<TData, TDrawable extends RowDrawable<TData>> extends Container<ItemRow<TData, TDrawable>> {
  constructor(private readonly pool: DrawablePool<TDrawable>, private readonly rowHeight: number) {
    super();
  }

  get flowingChildren(): ItemRow<TData, TDrawable>[] {
    return this.children.filter(d => d.isPresent);
  }

  insert(row: TData, index: number): void {
    this.add(new ItemRow(row, this.pool).with({
      height: this.rowHeight,
      lifetimeEnd: Number.NEGATIVE_INFINITY,
      // the depth management is mostly done so that enumeration order of `Children` matches expectations.
      // in edge cases it could also ensure correct Z-ordering of children, but it's a secondary consideration.
      depth: -index,
      y: index * this.rowHeight,
    }));
  }

  /** (C#'s Remove(ItemRow), an overload of Container.Remove) */
  removeRow(itemRow: ItemRow<TData, TDrawable>): void {
    itemRow.unloadRow();
    this.remove(itemRow, true);
  }

  move(itemRow: ItemRow<TData, TDrawable>, newIndex: number): void {
    itemRow.y = newIndex * this.rowHeight;
    this.changeChildDepth(itemRow, -newIndex);
  }
}

/** (VirtualisedListContainer.ItemRow) */
export class ItemRow<TData, TDrawable extends RowDrawable<TData>> extends CompositeDrawable {
  override get removeWhenNotAlive(): boolean {
    return false;
  }

  override get disposeOnDeathRemoval(): boolean {
    return false;
  }

  private _row!: TData;

  get row(): TData {
    return this._row;
  }

  set row(value: TData) {
    this._row = value;
    const rowDrawable = this.internalChildren[0] as TDrawable | undefined;
    if (rowDrawable !== undefined)
      rowDrawable.current.value = value;
  }

  private _visible = false;

  get visible(): boolean {
    return this._visible;
  }

  constructor(row: TData, private readonly pool: DrawablePool<TDrawable>) {
    super();

    this.row = row;
    this.relativeSizeAxes = Axes.X;

    // to avoid overheads from input handling (or, to be more specific, from constructing input queues),
    // the row manages its own lifetime.
    // if the row is not alive, it is not in `AliveInternalChildren` of its parent,
    // which means that it is omitted from consideration in `Build(Non)PositionalInputQueue()` et al.
    this.lifetimeEnd = Number.NEGATIVE_INFINITY;
  }

  /** (C#'s Load(); `load` is the framework's loader here) */
  loadRow(): void {
    this.internalChild = this.pool.get(d => d.current.value = this._row);
    this._visible = true;
    this.lifetimeEnd = Number.POSITIVE_INFINITY;
  }

  /** (C#'s Unload()) */
  unloadRow(): void {
    this.clearInternal(false);
    this._visible = false;
    this.lifetimeEnd = Number.NEGATIVE_INFINITY;
  }
}
