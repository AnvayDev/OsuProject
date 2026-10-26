// Ported from osu.Framework/Graphics/UserInterface/Dropdown.cs
// Item text comes from generateItemText (C# also reads [LocalisableDescription] off enums: subclasses here describe their values).
// Item equality is reference / value equality (C#'s EqualityComparer<T>.Default for the types used: enums, strings and records compared by
// reference as stored).

import { DependencyContainer, type IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Bindable, BindableBool, BindableWithCurrent } from '../../bindables/Bindable';
import { BindableList, NotifyCollectionChangedAction, type NotifyCollectionChangedEvent } from '../../bindables/BindableList';
import { Signal } from '../../bindables/Signal';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '../../input/bindings/KeyBindings';
import type { HoverEvent, KeyDownEvent } from '../../input/events/UIEvents';
import { Key } from '../../input/Key';
import { PlatformAction } from '../../input/PlatformAction';
import { Axes, Direction, FillDirection, Invalidation, LoadState } from '../../layout/Enums';
import { InvalidationSource, LayoutValue } from '../../layout/Layout';
import { Colour4 } from '../Colour4';
import { CompositeDrawable } from '../containers/CompositeDrawable';
import { FillFlowContainer } from '../containers/FillFlowContainer';
import { SearchContainer } from '../containers/SearchContainer';
import type { Drawable } from '../Drawable';
import { type DropdownHeader, DropdownSelectionAction } from './DropdownHeader';
import { IDropdown } from './IDropdown';
import { DrawableMenuItem, type IItemsFlow, Menu, MenuState } from './Menu';
import { DropdownMenuItem, type MenuItem } from './MenuItem';

/** A drop-down menu to select from a group of values. */
export abstract class Dropdown<T> extends CompositeDrawable implements IDropdown {
  readonly isDropdown = true;
  readonly isFocusManager = true;

  /** (protected internal) */
  header: DropdownHeader;
  /** (protected internal) */
  menu: DropdownMenu<T>;

  /** Whether this Dropdown should display a search bar when focused. */
  get alwaysShowSearchBar(): boolean {
    return this.header.alwaysShowSearchBar;
  }

  set alwaysShowSearchBar(value: boolean) {
    this.header.alwaysShowSearchBar = value;
  }

  get allowNonContiguousMatching(): boolean {
    return this.menu.allowNonContiguousMatching;
  }

  set allowNonContiguousMatching(value: boolean) {
    this.menu.allowNonContiguousMatching = value;
  }

  protected abstract createHeader(): DropdownHeader;

  private readonly itemMap = new Map<T, DropdownMenuItem<T>>();

  protected get menuItems(): DropdownMenuItem<T>[] {
    return [...this.itemMap.values()];
  }

  /** Enumerate all values in the dropdown. */
  get items(): T[] {
    return this.menuItems.map(i => i.value);
  }

  set items(value: Iterable<T>) {
    if (this.boundItemSource !== null)
      throw new Error('Cannot manually set Items when an ItemSource is bound.');

    this.setItems(value);
  }

  private readonly itemSourceList = new BindableList<T>();
  private boundItemSource: BindableList<T> | null = null;

  /** Allows the developer to assign a BindableList<T> as the source of items for this dropdown. */
  get itemSource(): BindableList<T> {
    return this.itemSourceList;
  }

  set itemSource(value: BindableList<T>) {
    if (this.boundItemSource !== null) this.itemSourceList.unbindFrom(this.boundItemSource);
    this.itemSourceList.bindTo(this.boundItemSource = value);

    this.setItems(value);
  }

  private readonly _enabled = new BindableBool(true);

  private setItems(value: Iterable<T> | null): void {
    this.clearItemsInternal();

    if (value === null)
      return;

    for (const entry of value)
      this.addDropdownItemInternal(entry);

    this.ensureItemSelectionIsValid();
  }

  /** Add a menu item directly while automatically generating a label. */
  addDropdownItem(value: T): void {
    if (this.boundItemSource !== null)
      throw new Error('Cannot manually add dropdown items when an ItemSource is bound.');

    this.addDropdownItemInternal(value);
  }

  private addDropdownItemInternal(value: T, position: number | null = null): void {
    if (this.itemMap.has(value))
      throw new Error(`The item ${String(value)} already exists in this Dropdown.`);

    const item = new DropdownMenuItem<T>('', value, () => {
      if (!this.current.disabled)
        this.current.value = value;

      this.menu.close();
    });

    // inheritors expect that `virtual generateItemText` is only called when this dropdown's BDL has run to completion.
    if (this.loadState >= LoadState.Ready)
      item.text.value = this.generateItemText(value);

    if (position !== null)
      this.menu.insert(position, item);
    else
      this.menu.add(item);

    this.itemMap.set(value, item);
  }

  /** Remove a menu item directly. Returns whether the item was removed. */
  removeDropdownItem(value: T): boolean {
    if (this.boundItemSource !== null)
      throw new Error('Cannot manually remove items when an ItemSource is bound.');

    return this.removeDropdownItemInternal(value);
  }

  private removeDropdownItemInternal(value: T): boolean {
    if (value == null)
      return false;

    const item = this.itemMap.get(value);
    if (item === undefined)
      return false;

    this.menu.remove(item);
    this.itemMap.delete(value);
    return true;
  }

  protected generateItemText(item: T): string {
    if (typeof (item as { text?: unknown })?.text === 'string')
      return (item as { text: string }).text;

    return item == null ? 'null' : String(item);
  }

  /** Puts the state of this Dropdown one level back: clears the search bar, then closes the menu. Returns whether anything changed. */
  back(): boolean {
    if (this.header.searchBar.back())
      return true;

    if (this.menu.state === MenuState.Open) {
      this.menu.close();
      return true;
    }

    return false;
  }

  private readonly _current = new BindableWithCurrent<T>();

  get current(): Bindable<T> {
    return this._current.current;
  }

  set current(value: Bindable<T>) {
    this._current.current = value;
  }

  private _selectedItem: DropdownMenuItem<T> | null = null;

  protected get selectedItem(): DropdownMenuItem<T> | null {
    return this._selectedItem;
  }

  protected set selectedItem(value: DropdownMenuItem<T> | null) {
    if (this.current.disabled)
      return;

    this._selectedItem = value;

    if (value !== null)
      this.current.value = value.value;
  }

  protected constructor() {
    super();

    this.autoSizeAxes = Axes.Y;

    let header!: DropdownHeader;
    let menu!: DropdownMenu<T>;

    this.internalChild = new FillFlowContainer().with({
      children: [
        header = this.createHeader(),
        menu = this.createMenu(),
      ],
      direction: FillDirection.Vertical,
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
    });

    this.header = header;
    this.menu = menu;

    this.header.changeSelection.add(this.selectionKeyPressed);
    this.header.searchTerm.valueChanged.add(t => this.menu.searchTerm = t.newValue);

    this.menu.relativeSizeAxes = Axes.X;
    this.menu.filterCompleted.add(this.filterCompleted);

    this.current.valueChanged.add(val => {
      this.pendingSelection = val.newValue;
      this.scheduler.addOnce(this.updatePendingItemSelection);
    });
    this.current.disabledChanged.add(disabled => {
      this._enabled.value = !disabled;
      if (disabled && this.menu.state === MenuState.Open)
        this.menu.state = MenuState.Closed;
    });

    this.itemSource.collectionChanged.add(this.collectionChanged);
  }

  // (Scheduler.AddOnce(updateItemSelection, val.NewValue): the latest value with a stable delegate.)
  private pendingSelection!: T;
  private readonly updatePendingItemSelection = (): void => this.updateItemSelection(this.pendingSelection);

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    // ([Cached(typeof(IDropdown))])
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cacheAs(IDropdown, this as IDropdown);
    return dependencies;
  }

  private readonly filterCompleted = (): void => {
    if (this.menu.searchTerm)
      this.menu.preselectItemAt(0);
    else
      this.menu.preselectItem(null);
  };

  private readonly selectionKeyPressed = (action: DropdownSelectionAction): void => {
    if (this.itemMap.size === 0)
      return;

    const dropdownMenuItems = this.menuItems;
    const clamp = (v: number) => Math.min(Math.max(v, 0), dropdownMenuItems.length - 1);
    const selectedIndex = this._selectedItem === null ? -1 : dropdownMenuItems.indexOf(this._selectedItem);

    switch (action) {
      case DropdownSelectionAction.Previous:
        this.selectedItem = dropdownMenuItems[clamp(selectedIndex - 1)];
        break;

      case DropdownSelectionAction.Next:
        this.selectedItem = dropdownMenuItems[clamp(selectedIndex + 1)];
        break;

      case DropdownSelectionAction.First:
        this.selectedItem = dropdownMenuItems[0];
        break;

      case DropdownSelectionAction.Last:
        this.selectedItem = dropdownMenuItems[dropdownMenuItems.length - 1];
        break;

      default:
        throw new Error('Unexpected selection action type.');
    }
  };

  protected override loadAsyncComplete(): void {
    super.loadAsyncComplete();

    for (const item of this.menuItems)
      item.text.value = this.generateItemText(item.value);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.header.label = this._selectedItem?.text.value ?? '';
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (e.key === Key.Escape)
      return this.back();

    return false;
  }

  private readonly collectionChanged = (_sender: BindableList<T>, e: NotifyCollectionChangedEvent<T>): void => {
    switch (e.action) {
      case NotifyCollectionChangedAction.Add: {
        const newItems = e.newItems!;

        for (let i = 0; i < newItems.length; i++)
          this.addDropdownItemInternal(newItems[i], e.newStartingIndex + i);

        break;
      }

      case NotifyCollectionChangedAction.Remove:
        for (const item of e.oldItems!)
          this.removeDropdownItemInternal(item);

        break;

      case NotifyCollectionChangedAction.Move: {
        const item = this.items[e.oldStartingIndex];
        this.removeDropdownItemInternal(item);
        this.addDropdownItemInternal(item, e.newStartingIndex);
        break;
      }

      case NotifyCollectionChangedAction.Replace: {
        for (const item of e.oldItems!)
          this.removeDropdownItemInternal(item);

        const newItems = e.newItems!;

        for (let i = 0; i < newItems.length; i++)
          this.addDropdownItemInternal(newItems[i], e.newStartingIndex + i);

        break;
      }

      case NotifyCollectionChangedAction.Reset:
        this.clearItemsInternal();
        break;
    }

    this.ensureItemSelectionIsValid();
  };

  private ensureItemSelectionIsValid(): void {
    if (this.current.value == null || !this.itemMap.has(this.current.value)) {
      this.current.value = this.itemMap.keys().next().value as T;
      return;
    }

    this.updateItemSelection(this.current.value);
  }

  private updateItemSelection(value: T): void {
    const existingItem = value != null ? this.itemMap.get(value) : undefined;

    if (existingItem !== undefined)
      this._selectedItem = existingItem;
    else {
      if (value == null && this._selectedItem !== null)
        this._selectedItem = new DropdownMenuItem<T>('', undefined as T);
      else
        this._selectedItem = new DropdownMenuItem<T>(this.generateItemText(value), value);
    }

    this.menu.selectItem(this._selectedItem);
    this.header.label = this._selectedItem.text.value;
  }

  /** Clear all the menu items. */
  clearItems(): void {
    if (this.boundItemSource !== null)
      throw new Error('Cannot manually clear items when an ItemSource is bound.');

    this.clearItemsInternal();
  }

  private clearItemsInternal(): void {
    this.itemMap.clear();
    this.menu.clear();
  }

  /** (internal) Hide the menu item of specified value. */
  hideItem(val: T): void {
    const item = this.itemMap.get(val);

    if (item !== undefined) {
      this.menu.hideItem(item);
      this.updateHeaderVisibility();
    }
  }

  /** (internal) Show the menu item of specified value. */
  showItem(val: T): void {
    const item = this.itemMap.get(val);

    if (item !== undefined) {
      this.menu.showItem(item);
      this.updateHeaderVisibility();
    }
  }

  private updateHeaderVisibility(): void {
    this.header.alpha = this.menu.anyPresent ? 1 : 0;
  }

  /** Creates the menu body. */
  protected abstract createMenu(): DropdownMenu<T>;

  // #region IFocusManager

  // Isolate input so that the Menu doesn't disturb focus. Focus is managed via the IDropdown interface.
  /** (IFocusManager.TriggerFocusContention) */
  triggerFocusContention(_triggerSource: Drawable | null): void {
  }

  // #endregion

  // #region IDropdown

  get menuStateChanged(): Signal<MenuState> {
    return this.menu.stateChanged;
  }

  get enabled(): Bindable<boolean> {
    return this._enabled;
  }

  get menuState(): MenuState {
    return this.menu.state;
  }

  toggleMenu(): void {
    if (!this.current.disabled)
      this.menu.toggle();
  }

  openMenu(): void {
    if (!this.current.disabled)
      this.menu.state = MenuState.Open;
  }

  closeMenu(): void {
    if (!this.current.disabled)
      this.menu.state = MenuState.Closed;
  }

  commitPreselection(): void {
    if (this.current.disabled)
      return;

    const visibleMenuItemsList = this.menu.visibleMenuItems;

    if (visibleMenuItemsList.length === 0)
      return;

    const targetPreselectionIndex = visibleMenuItemsList.indexOf(this.menu.preselectedItem!);
    const preselectedItem = visibleMenuItemsList[targetPreselectionIndex];

    this.selectedItem = preselectedItem.item as DropdownMenuItem<T>;
  }

  /**
   * IFocusManager.ChangeFocus (isolating the menu: returns false) and IDropdown.ChangeFocus (forwarding to the containing focus manager)
   * share a name; C# implements them explicitly. Drawables below the dropdown call it as their focus manager; the search bar reaches the
   * outer one through dropdownChangeFocus.
   */
  changeFocus(_potentialFocusTarget: Drawable | null): boolean {
    return false;
  }

  /** (IDropdown.TriggerFocusContention) */
  dropdownTriggerFocusContention(triggerSource: Drawable | null): void {
    this.getContainingFocusManager()?.triggerFocusContention(triggerSource);
  }

  /** (IDropdown.ChangeFocus) */
  dropdownChangeFocus(potentialFocusTarget: Drawable | null): boolean {
    return this.getContainingFocusManager()?.changeFocus(potentialFocusTarget) ?? false;
  }

  // #endregion
}

/** (Dropdown.DropdownMenu.SearchableItemsFlow) */
class SearchableItemsFlow extends SearchContainer<DrawableMenuItem> implements IItemsFlow {
  readonly sizeCache = new LayoutValue(Invalidation.RequiredParentSizeToFit, InvalidationSource.Self);

  constructor() {
    super();
    this.addLayout(this.sizeCache);
  }
}

/** (Dropdown<T>.DropdownMenu) */
export abstract class DropdownMenu<T> extends Menu implements IKeyBindingHandler<PlatformAction> {
  readonly keyBindingActionTypes: readonly object[] = [PlatformAction];

  // (declare: assigned by createItemsFlow() during the base constructor, which a field initializer would then reset.)
  declare private searchableItemsFlow: SearchableItemsFlow;

  get searchTerm(): string {
    return this.searchableItemsFlow.searchTerm ?? '';
  }

  set searchTerm(value: string) {
    this.searchableItemsFlow.searchTerm = value;
  }

  get allowNonContiguousMatching(): boolean {
    return this.searchableItemsFlow.allowNonContiguousMatching;
  }

  set allowNonContiguousMatching(value: boolean) {
    this.searchableItemsFlow.allowNonContiguousMatching = value;
  }

  get filterCompleted(): Signal {
    return this.searchableItemsFlow.filterCompleted;
  }

  protected constructor() {
    super(Direction.Vertical);

    this.stateChanged.add(this.clearPreselection);
  }

  private readonly clearPreselection = (obj: MenuState): void => {
    if (obj === MenuState.Closed)
      this.preselectItem(null);
  };

  /** (protected internal) */
  get visibleMenuItems(): DrawableDropdownMenuItem<T>[] {
    return this.menuChildren.filter((i): i is DrawableDropdownMenuItem<T> => i instanceof DrawableDropdownMenuItem && i.matchingFilter);
  }

  /** (protected internal) */
  get menuItemsInView(): DrawableDropdownMenuItem<T>[] {
    return this.visibleMenuItems.filter(item => !item.isMaskedAway);
  }

  get preselectedItem(): DrawableDropdownMenuItem<T> | null {
    return this.visibleMenuItems.find(c => c.isPreSelected)
      ?? this.visibleMenuItems.find(c => c.isSelected)
      ?? null;
  }

  private get dropdownChildren(): DrawableDropdownMenuItem<T>[] {
    return this.menuChildren.filter((c): c is DrawableDropdownMenuItem<T> => c instanceof DrawableDropdownMenuItem);
  }

  selectItem(item: DropdownMenuItem<T>): void {
    for (const c of this.dropdownChildren) {
      const wasSelected = c.isSelected;
      c.isSelected = DropdownMenu.compareItemEquality(item, c.item);
      if (c.isSelected && !wasSelected)
        this.contentContainer.scrollIntoView(c);
    }
  }

  hideItem(item: DropdownMenuItem<T>): void {
    this.menuChildren.find(c => DropdownMenu.compareItemEquality(item, c.item))?.hide();
  }

  showItem(item: DropdownMenuItem<T>): void {
    this.menuChildren.find(c => DropdownMenu.compareItemEquality(item, c.item))?.show();
  }

  get anyPresent(): boolean {
    return this.menuChildren.some(c => c.isPresent);
  }

  /** (protected internal PreselectItem(int)) */
  preselectItemAt(index: number): void {
    const visible = this.visibleMenuItems;

    this.preselectItem(visible.length > 0
      ? visible[Math.min(Math.max(index, 0), visible.length - 1)].item
      : null);
  }

  /** (protected internal PreselectItem(MenuItem)) */
  readonly preselectItem = (item: MenuItem | null): void => {
    for (const c of this.dropdownChildren) {
      const wasPreSelected = c.isPreSelected;
      c.isPreSelected = DropdownMenu.compareItemEquality(item, c.item);
      if (c.isPreSelected && !wasPreSelected)
        this.contentContainer.scrollIntoView(c);
    }
  };

  protected override createDrawableMenuItem(item: MenuItem): DrawableMenuItem {
    const drawableItem = this.createDrawableDropdownMenuItem(item);
    drawableItem.preselectionRequested.add(this.preselectItem);
    return drawableItem;
  }

  protected abstract createDrawableDropdownMenuItem(item: MenuItem): DrawableDropdownMenuItem<T>;

  private static compareItemEquality(a: MenuItem | null, b: MenuItem | null): boolean {
    if (!(a instanceof DropdownMenuItem) || !(b instanceof DropdownMenuItem))
      return false;

    return a.value === b.value;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    const visibleMenuItemsList = this.visibleMenuItems;

    if (visibleMenuItemsList.length > 0) {
      const currentPreselected = this.preselectedItem;
      const targetPreselectionIndex = currentPreselected === null ? -1 : visibleMenuItemsList.indexOf(currentPreselected);

      switch (e.key) {
        case Key.Up:
          this.preselectItemAt(targetPreselectionIndex - 1);
          return true;

        case Key.Down:
          this.preselectItemAt(targetPreselectionIndex + 1);
          return true;

        case Key.PageUp: {
          const firstVisibleItem = this.menuItemsInView[0];

          if (currentPreselected === firstVisibleItem)
            this.preselectItemAt(targetPreselectionIndex - this.menuItemsInView.length);
          else
            this.preselectItemAt(visibleMenuItemsList.indexOf(firstVisibleItem));
          return true;
        }

        case Key.PageDown: {
          const inView = this.menuItemsInView;
          const lastVisibleItem = inView[inView.length - 1];

          if (currentPreselected === lastVisibleItem)
            this.preselectItemAt(targetPreselectionIndex + inView.length);
          else
            this.preselectItemAt(visibleMenuItemsList.indexOf(lastVisibleItem));
          return true;
        }
      }
    }

    if (e.key === Key.Escape)
      // we'll handle closing the menu in Dropdown instead,
      // since a search bar may be active and we want to reset it rather than closing the menu.
      return false;

    return super.onKeyDown(e);
  }

  onPressed(e: KeyBindingPressEvent<PlatformAction>): boolean {
    switch (e.action) {
      case PlatformAction.MoveToListStart:
        this.preselectItem(this.items[0] ?? null);
        return true;

      case PlatformAction.MoveToListEnd:
        this.preselectItem(this.items[this.items.length - 1] ?? null);
        return true;

      default:
        return false;
    }
  }

  onReleased(_e: KeyBindingReleaseEvent<PlatformAction>): void {
  }

  protected override createItemsFlow(direction: FillDirection): FillFlowContainer<DrawableMenuItem> & IItemsFlow {
    return this.searchableItemsFlow = new SearchableItemsFlow().with({ direction });
  }
}

/** (Dropdown<T>.DropdownMenu.DrawableDropdownMenuItem) */
export abstract class DrawableDropdownMenuItem<T> extends DrawableMenuItem {
  readonly isFilterable = true;

  readonly preselectionRequested = new Signal<DropdownMenuItem<T> | null>();

  private _matchingFilter = true;

  get matchingFilter(): boolean {
    return this._matchingFilter;
  }

  set matchingFilter(value: boolean) {
    this._matchingFilter = value;
    this.updateFilteringState(value);
  }

  set filteringActive(_value: boolean) {
  }

  protected constructor(item: MenuItem) {
    super(item);
  }

  private selected = false;

  get isSelected(): boolean {
    return !this.item.action.disabled && this.selected;
  }

  set isSelected(value: boolean) {
    if (this.selected === value)
      return;

    this.selected = value;

    this.onSelectChange();
  }

  private preSelected = false;

  get isPreSelected(): boolean {
    return this.preSelected;
  }

  set isPreSelected(value: boolean) {
    if (this.preSelected === value)
      return;

    this.preSelected = value;

    this.onSelectChange();
  }

  private _backgroundColourSelected = Colour4.fromBytes(112, 128, 144, 255); // (Color4.SlateGray)

  get backgroundColourSelected(): Colour4 {
    return this._backgroundColourSelected;
  }

  set backgroundColourSelected(value: Colour4) {
    this._backgroundColourSelected = value;
    this.scheduler.addOnce(this.updateBackgroundColourSelectedCallback);
  }

  private _foregroundColourSelected = Colour4.White;

  get foregroundColourSelected(): Colour4 {
    return this._foregroundColourSelected;
  }

  set foregroundColourSelected(value: Colour4) {
    this._foregroundColourSelected = value;
    this.scheduler.addOnce(this.updateForegroundColourSelectedCallback);
  }

  // (stable delegates for Scheduler.AddOnce)
  private readonly updateBackgroundColourSelectedCallback = (): void => this.updateBackgroundColour();
  private readonly updateForegroundColourSelectedCallback = (): void => this.updateForegroundColour();

  protected onSelectChange(): void {
    this.scheduler.addOnce(this.updateBackgroundColourSelectedCallback);
    this.scheduler.addOnce(this.updateForegroundColourSelectedCallback);
  }

  protected override updateBackgroundColour(): void {
    this.background.fadeColour(this.isPreSelected ? this.backgroundColourHover : this.isSelected ? this.backgroundColourSelected : this.backgroundColour);
  }

  protected override updateForegroundColour(): void {
    this.foreground.fadeColour(this.isPreSelected ? this.foregroundColourHover : this.isSelected ? this.foregroundColourSelected : this.foregroundColour);
  }

  protected updateFilteringState(filtered: boolean): void {
    this.fadeTo(filtered ? 1 : 0);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.preselectionRequested.emit(this.item as DropdownMenuItem<T>);
    return super.onHover(e);
  }
}
