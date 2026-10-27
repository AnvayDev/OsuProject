// Ported from osu.Framework/Bindables/BindableList.cs (and IBindableList.cs). Bindings are strongly referenced, like all bindables in this port.
// System.Collections.Specialized.NotifyCollectionChangedEventArgs is reproduced as NotifyCollectionChangedEvent (same constructor semantics).
// IndexOf / Contains / Remove compare like List<T> (EqualityComparer<T>.Default): an item's equals(other) when it has one (IEquatable<T>),
// otherwise reference equality.

/** (EqualityComparer<T>.Default.Equals) */
function defaultEquals<T>(a: T, b: T): boolean {
  if (a === b)
    return true;

  return a !== null && typeof a === 'object' && typeof (a as { equals?: unknown }).equals === 'function'
    && (a as unknown as { equals(other: T): boolean }).equals(b);
}

function indexOfEqual<T>(collection: readonly T[], item: T): number {
  for (let i = 0; i < collection.length; i++) {
    if (defaultEquals(item, collection[i]))
      return i;
  }

  return -1;
}

export enum NotifyCollectionChangedAction {
  Add,
  Remove,
  Replace,
  Move,
  Reset,
}

export interface NotifyCollectionChangedEvent<T> {
  readonly action: NotifyCollectionChangedAction;
  readonly newItems: readonly T[] | null;
  readonly oldItems: readonly T[] | null;
  readonly newStartingIndex: number;
  readonly oldStartingIndex: number;
}

const changed = <T>(action: NotifyCollectionChangedAction, newItems: readonly T[] | null, oldItems: readonly T[] | null, newStartingIndex = -1, oldStartingIndex = -1): NotifyCollectionChangedEvent<T> =>
  ({ action, newItems, oldItems, newStartingIndex, oldStartingIndex });

type Handler<T> = (sender: BindableList<T>, e: NotifyCollectionChangedEvent<T>) => void;

export class BindableList<T> implements Iterable<T> {
  private collectionChangedHandlers: Handler<T>[] = [];
  private disabledChangedHandlers: ((disabled: boolean) => void)[] = [];

  private readonly collection: T[] = [];

  private bindings: BindableList<T>[] | null = null;

  /** Creates a new BindableList, optionally adding the items of the given collection. */
  constructor(items: Iterable<T> | null = null) {
    if (items !== null)
      this.collection.push(...items);
  }

  /** An event which is raised when this BindableList changes. */
  readonly collectionChanged = {
    add: (handler: Handler<T>) => { this.collectionChangedHandlers = [...this.collectionChangedHandlers, handler]; },
    remove: (handler: Handler<T>) => { this.collectionChangedHandlers = this.collectionChangedHandlers.filter(h => h !== handler); },
  };

  private raise(e: NotifyCollectionChangedEvent<T>): void {
    for (const h of this.collectionChangedHandlers)
      h(this, e);
  }

  // #region IList<T>

  get(index: number): T {
    return this.collection[index];
  }

  /** this[index] = item */
  set(index: number, item: T): void {
    this.setIndex(index, item, new Set());
  }

  private setIndex(index: number, item: T, appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    const lastItem = this.collection[index];

    this.collection[index] = item;

    for (const b of this.bindings ?? [])
      b.setIndex(index, item, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Replace, [item], [lastItem], index, index));
  }

  /** Adds a single item to this BindableList. */
  add(item: T): void {
    this.addItem(item, new Set());
  }

  private addItem(item: T, appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    this.collection.push(item);

    for (const b of this.bindings ?? [])
      b.addItem(item, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Add, [item], null, this.collection.length - 1));
  }

  /** Retrieves the index of an item in this BindableList. */
  indexOf(item: T): number {
    return indexOfEqual(this.collection, item);
  }

  /** Inserts an item at the specified index in this BindableList. */
  insert(index: number, item: T): void {
    this.insertItem(index, item, new Set());
  }

  private insertItem(index: number, item: T, appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    this.collection.splice(index, 0, item);

    for (const b of this.bindings ?? [])
      b.insertItem(index, item, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Add, [item], null, index));
  }

  /** Clears the contents of this BindableList. */
  clear(): void {
    this.clearItems(new Set());
  }

  private clearItems(appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    if (this.collection.length <= 0)
      return;

    // Preserve items for subscribers
    const clearedItems = [...this.collection];

    this.collection.length = 0;

    for (const b of this.bindings ?? [])
      b.clearItems(appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Remove, null, clearedItems, -1, 0));
  }

  /** Determines if an item is in this BindableList. */
  contains(item: T): boolean {
    return indexOfEqual(this.collection, item) >= 0;
  }

  /** Removes an item from this BindableList. Returns whether the item was removed. */
  remove(item: T): boolean {
    return this.removeItem(item, new Set());
  }

  private removeItem(item: T, appliedInstances: Set<BindableList<T>>): boolean {
    if (this.checkAlreadyApplied(appliedInstances))
      return false;

    this.ensureMutationAllowed();

    const index = indexOfEqual(this.collection, item);

    if (index < 0)
      return false;

    // Removal may have come from an equality comparison.
    // Always return the original reference from the list to other bindings and events.
    const listItem = this.collection[index];

    this.collection.splice(index, 1);

    // prevent re-removing from the callee.
    for (const b of this.bindings ?? [])
      b.removeItem(listItem, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Remove, null, [listItem], -1, index));

    return true;
  }

  /** Removes count items starting from index. */
  removeRange(index: number, count: number): void {
    this.removeRangeItems(index, count, new Set());
  }

  private removeRangeItems(index: number, count: number, appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    if (count === 0)
      return;

    // Preserve items for subscribers
    const removedItems = this.collection.splice(index, count);

    for (const b of this.bindings ?? [])
      b.removeRangeItems(index, count, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Remove, null, removedItems, -1, index));
  }

  /** Removes an item at the specified index from this BindableList. */
  removeAt(index: number): void {
    this.removeAtIndex(index, new Set());
  }

  private removeAtIndex(index: number, appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    const item = this.collection[index];

    this.collection.splice(index, 1);

    for (const b of this.bindings ?? [])
      b.removeAtIndex(index, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Remove, null, [item], -1, index));
  }

  /** Removes all items from this BindableList that match a predicate. Returns how many items were removed. */
  removeAll(match: (item: T) => boolean): number {
    return this.removeAllItems(match, new Set());
  }

  private removeAllItems(match: (item: T) => boolean, appliedInstances: Set<BindableList<T>>): number {
    if (this.checkAlreadyApplied(appliedInstances))
      return 0;

    this.ensureMutationAllowed();

    // Preserve items for subscribers
    const removedItems = this.collection.filter(match);

    if (removedItems.length === 0)
      return 0;

    const kept = this.collection.filter(i => !match(i));
    this.collection.length = 0;
    this.collection.push(...kept);

    for (const b of this.bindings ?? [])
      b.removeAllItems(match, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Remove, null, removedItems));

    return removedItems.length;
  }

  /** Replaces count items starting from index with newItems. */
  replaceRange(index: number, count: number, newItems: Iterable<T>): void {
    this.replaceRangeItems(index, count, [...newItems], new Set());
  }

  private replaceRangeItems(index: number, count: number, newItems: T[], appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    if (count === 0 && newItems.length === 0)
      return;

    // Preserve items for subscribers
    const removedItems = this.collection.splice(index, count, ...newItems);

    for (const b of this.bindings ?? [])
      b.replaceRangeItems(index, count, newItems, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Replace, newItems, removedItems, index, index));
  }

  private checkAlreadyApplied(appliedInstances: Set<BindableList<T>>): boolean {
    if (appliedInstances.has(this))
      return true;

    appliedInstances.add(this);
    return false;
  }

  /** List<T>.BinarySearch(item): the index of a matching item, or the bitwise complement of the next larger item's index. */
  binarySearch(item: T, compare: (a: T, b: T) => number = (a, b) => (a as unknown as { compareTo(o: T): number }).compareTo(b)): number {
    let lo = 0;
    let hi = this.collection.length - 1;

    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      const c = compare(this.collection[mid], item);

      if (c === 0)
        return mid;

      if (c < 0)
        lo = mid + 1;
      else
        hi = mid - 1;
    }

    return ~lo;
  }

  get count(): number {
    return this.collection.length;
  }

  get isReadOnly(): boolean {
    return this.disabled;
  }

  // #endregion

  // #region IParseable

  /** Parse an object into this instance. An IEnumerable<T> replaces the contents of this BindableList (if they differ); null clears it. */
  parse(input: Iterable<T> | null): void {
    this.ensureMutationAllowed();

    if (input === null) {
      this.clear();
      return;
    }

    // enumerate once locally before proceeding.
    const newItems = [...input];

    if (newItems.length === this.collection.length && newItems.every((item, i) => item === this.collection[i]))
      return;

    this.clear();
    this.addRange(newItems);
  }

  // #endregion

  // #region ICanBeDisabled

  private _disabled = false;

  /** Whether this BindableList has been disabled. When disabled, attempting to change the contents will result in an Error. */
  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    if (value === this._disabled)
      return;

    this._disabled = value;

    this.triggerDisabledChange();
  }

  bindDisabledChanged(onChange: (disabled: boolean) => void, runOnceImmediately = false): void {
    this.disabledChangedHandlers = [...this.disabledChangedHandlers, onChange];

    if (runOnceImmediately)
      onChange(this._disabled);
  }

  private triggerDisabledChange(propagateToBindings = true): void {
    // check a bound bindable hasn't changed the value again (it will fire its own event)
    const beforePropagation = this._disabled;

    if (propagateToBindings) {
      for (const b of this.bindings ?? [])
        b.disabled = this._disabled;
    }

    if (beforePropagation === this._disabled) {
      for (const h of this.disabledChangedHandlers)
        h(this._disabled);
    }
  }

  // #endregion

  // #region IUnbindable

  unbindEvents(): void {
    this.collectionChangedHandlers = [];
    this.disabledChangedHandlers = [];
  }

  unbindBindings(): void {
    for (const b of [...(this.bindings ?? [])])
      this.unbindFrom(b);
  }

  unbindAll(): void {
    this.unbindEvents();
    this.unbindBindings();
  }

  unbindFrom(them: BindableList<T>): void {
    this.removeBinding(them);
    them.removeBinding(this);
  }

  // #endregion

  /** Adds a collection of items to this BindableList. */
  addRange(items: Iterable<T>): void {
    this.addRangeItems([...items], new Set());
  }

  private addRangeItems(items: T[], appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    this.collection.push(...items);

    for (const b of this.bindings ?? [])
      b.addRangeItems(items, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Add, items, null, this.collection.length - items.length));
  }

  /** Moves an item in this collection. */
  move(oldIndex: number, newIndex: number): void {
    this.moveItem(oldIndex, newIndex, new Set());
  }

  private moveItem(oldIndex: number, newIndex: number, appliedInstances: Set<BindableList<T>>): void {
    if (this.checkAlreadyApplied(appliedInstances)) return;

    this.ensureMutationAllowed();

    const item = this.collection[oldIndex];

    this.collection.splice(oldIndex, 1);
    this.collection.splice(newIndex, 0, item);

    for (const b of this.bindings ?? [])
      b.moveItem(oldIndex, newIndex, appliedInstances);

    this.raise(changed(NotifyCollectionChangedAction.Move, [item], [item], newIndex, oldIndex));
  }

  set bindTarget(value: BindableList<T>) {
    this.bindTo(value);
  }

  /** Binds this BindableList with another, copying its contents and disabled state. */
  bindTo(them: BindableList<T>): void {
    if (this.bindings?.includes(them))
      throw new Error('An already bound collection can not be bound again.');
    if (them === this)
      throw new Error('A collection can not be bound to itself');

    // copy state and content over
    this.parse(them);
    this.disabled = them.disabled;

    this.addBinding(them);
    them.addBinding(this);
  }

  /** Bind an action to collectionChanged with the option of running the bound action once immediately with an Add event for the entire contents. */
  bindCollectionChanged(onChange: Handler<T>, runOnceImmediately = false): void {
    this.collectionChanged.add(onChange);

    if (runOnceImmediately)
      onChange(this, changed(NotifyCollectionChangedAction.Add, [...this.collection], null));
  }

  private addBinding(b: BindableList<T>): void {
    (this.bindings ??= []).push(b);
  }

  private removeBinding(b: BindableList<T>): void {
    if (this.bindings === null) return;

    const i = this.bindings.indexOf(b);
    if (i >= 0) this.bindings.splice(i, 1);
  }

  protected createInstance(): BindableList<T> {
    return new BindableList<T>();
  }

  /** Create an unbound clone of this BindableList, then bind it (IBindable.GetBoundCopyImplementation). */
  getBoundCopy(): BindableList<T> {
    const copy = this.createInstance();
    copy.bindTo(this);
    return copy;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.collection[Symbol.iterator]();
  }

  /** A read-only view of the items (C# enumeration / LINQ). */
  toArray(): readonly T[] {
    return this.collection;
  }

  private ensureMutationAllowed(): void {
    if (this._disabled)
      throw new Error('Cannot mutate the BindableList while it is disabled.');
  }

  get isDefault(): boolean {
    return this.collection.length === 0;
  }

  toString(): string {
    return `BindableList(Count=${this.collection.length})`;
  }
}
