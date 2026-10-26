// Ported from osu.Framework/Graphics/UserInterface/TabControl.cs
// Not ported yet: the overflow Dropdown (CreateDropdown) — it arrives with the Dropdown port. The only TabControl so far
// (BeatmapDetailsArea.WedgeSelector) creates none.

import { Bindable, BindableWithCurrent } from '../../bindables/Bindable';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '../../input/bindings/KeyBindings';
import { PlatformAction } from '../../input/PlatformAction';
import { Axes, FillDirection } from '../../layout/Enums';
import type { Vector2 } from '../../layout/Vector2';
import type { Drawable } from '../Drawable';
import { CompositeDrawable } from '../containers/CompositeDrawable';
import { FillFlowContainer } from '../containers/FillFlowContainer';
import type { TabItem } from './TabItem';

/** A single-row control to display a list of selectable tabs along with an optional right-aligned dropdown containing overflow items (tabs which cannot be displayed in the allocated width). */
export abstract class TabControl<T> extends CompositeDrawable implements IKeyBindingHandler<PlatformAction> {
  readonly keyBindingActionTypes: readonly object[] = [PlatformAction];

  private readonly _current = new BindableWithCurrent<T>();

  get current(): Bindable<T> {
    return this._current.current;
  }

  set current(value: Bindable<T>) {
    this._current.current = value;
  }

  /** A list of tabs which can be switched to (protected internal). */
  get switchableTabs(): TabItem<T>[] {
    return this.allTabs.filter(tab => tab.isSwitchable);
  }

  /** All tabs (protected internal). */
  get allTabs(): TabItem<T>[] {
    return this.tabContainer.allTabItems;
  }

  /** A list of items currently in the tab control in the order they are dispalyed. */
  get visibleItems(): T[] {
    return [...new Set(this.tabContainer.tabItems.map(t => t.value))];
  }

  private readonly _items: T[] = [];

  /** The list of all items contained by this TabControl. */
  get items(): readonly T[] {
    return this._items;
  }

  set items(value: readonly T[]) {
    for (const item of [...this._items])
      this.removeItem(item);

    for (const item of value)
      this.addItem(item);
  }

  /** Whether tabs should be sorted as they are selected. */
  autoSort = false;

  protected readonly tabContainer: TabFillFlowContainer<T>;

  private _selectedTab: TabItem<T> | null = null;

  protected get selectedTab(): TabItem<T> | null {
    return this._selectedTab;
  }

  /** When true, the first available tab (if any) will be selected by default. */
  selectFirstTabByDefault = true;

  /** When true, tabs selection can be cycled using PlatformAction.DocumentPrevious and PlatformAction.DocumentNext. */
  isSwitchable = false;

  /** When true, tabs will be automatically switched to the next/previous tab upon removal of the currently selected tab. */
  switchTabOnRemove = true;

  /** Creates the tab item for a value. */
  protected abstract createTabItem(value: T): TabItem<T>;

  private depthCounter = 0;

  /** A mapping of tabs to their items. */
  protected get tabMap(): ReadonlyMap<T, TabItem<T>> {
    return this._tabMap;
  }

  private readonly _tabMap = new Map<T, TabItem<T>>();

  private firstSelection = true;

  protected constructor() {
    super();

    this.addInternal(this.tabContainer = this.createTabFlow());

    this.current.valueChanged.add(() => this.firstSelection = false);
  }

  protected override loadComplete(): void {
    // Default to first selection in list, if we can
    if (this.firstSelection && this.selectFirstTabByDefault && !this.current.disabled && this.items.length > 0)
      this.current.value = this.items[0];

    this.current.bindValueChanged(v => {
      let tab: TabItem<T> | null = null;

      if (v.newValue != null)
        tab = this._tabMap.get(v.newValue) ?? null;

      // Only reorder if not pinned and not showing
      if (this.autoSort && tab !== null && !tab.isPresent && !tab.pinned)
        this.performTabSort(tab);

      // Deactivate previously selected tab
      if (this._selectedTab !== null && this._selectedTab !== tab) this._selectedTab.active.value = false;

      this._selectedTab = tab;

      if (this._selectedTab !== null)
        this._selectedTab.active.value = true;
    }, true);

    // TabContainer doesn't have valid layout yet, so TabItems all have y=0 and selectTab() didn't call performTabSort() so we call it here instead
    if (this.autoSort && this.current.value != null)
      this.performTabSort(this._tabMap.get(this.current.value)!);

    super.loadComplete();
  }

  /** Pin an item to the start of the tab control. */
  pinItem(item: T): void {
    const tab = this._tabMap.get(item);
    if (tab === undefined)
      return;

    tab.pinned = true;
  }

  /** Unpin an item and allow it to be sorted. */
  unpinItem(item: T): void {
    const tab = this._tabMap.get(item);
    if (tab === undefined)
      return;

    tab.pinned = false;
  }

  /** Add a new item to the tab control. */
  addItem(item: T): void {
    this.addTab(item);
  }

  /** Removes an item from the tab control. */
  removeItem(item: T): void {
    this.removeTab(item);
  }

  /** Removes all items from the tab control. */
  clear(): void {
    this.items = [];
  }

  private addTab(value: T): void {
    // Do not allow duplicate adding
    if (this._tabMap.has(value))
      throw new Error(`Item ${String(value)} has already been added to this TabControl`);

    const tab = this.createTabItem(value);
    this.addTabItem(tab);
  }

  private removeTab(value: T): void {
    const tab = this._tabMap.get(value);
    if (tab === undefined)
      throw new Error(`Item ${String(value)} doesn't exist in this TabControl.`);

    this.removeTabItem(tab);
  }

  /** Adds an arbitrary TabItem to the control. */
  protected addTabItem(tab: TabItem<T>): void {
    tab.pinnedChanged = this.performTabSort;
    tab.activationRequested = this.activationRequestedHandler;

    this._items.push(tab.value);
    this._tabMap.set(tab.value, tab);

    this.tabContainer.add(tab);
  }

  /** Removes a TabItem from this TabControl. */
  protected removeTabItem(tab: TabItem<T>): void {
    if (!tab.isRemovable)
      throw new Error(`Cannot remove non-removable tab ${tab.toString()}. Ensure isRemovable is set appropriately.`);

    if (this.switchTabOnRemove && tab === this._selectedTab) {
      if (this.switchableTabs.length < 2)
        this._selectedTab = null;
      else {
        // check all tabs as to include self (in correct iteration order)
        const all = this.allTabs;
        const anySwitchableTabsToRight = all.slice(all.indexOf(tab) + 1).some(t => t.isSwitchable);

        // switching tab on removal is not directly caused by the user.
        // call the private method to not trigger a user change event.
        this.switchTabInternal(anySwitchableTabsToRight ? 1 : -1);
      }
    }

    this._items.splice(this._items.indexOf(tab.value), 1);
    this._tabMap.delete(tab.value);

    this.tabContainer.remove(tab, true);
  }

  /** Selects a TabItem. */
  selectItem(item: T): void {
    const tab = this._tabMap.get(item);
    if (tab === undefined)
      throw new Error(`Item ${String(item)} cannot be selected as it does not exist in this TabControl`);

    this.selectTab(tab);
  }

  protected selectTab(tab: TabItem<T> | null): void {
    if (this.selectTabInternal(tab) && tab !== null)
      tab.onActivatedByUser();
  }

  /** Switches the currently selected tab forward or backward one index, optionally wrapping. */
  switchTab(direction: number, wrap = true): void {
    if (this.switchTabInternal(direction, wrap))
      this._selectedTab!.onActivatedByUser();
  }

  private switchTabInternal(direction: number, wrap = true): boolean {
    if (Math.abs(direction) !== 1) throw new Error('value must be -1 or 1');

    // the current selected tab may be an non-switchable tab, so search all tabs for a candidate.
    // this is done to ensure ordering (ie. if an non-switchable tab is in the middle).
    let allTabs = this.tabContainer.allTabItems.filter(t => t.isSwitchable || t === this._selectedTab);

    if (direction < 0)
      allTabs = allTabs.reverse();

    const selectedIndex = allTabs.indexOf(this._selectedTab!);
    let found: TabItem<T> | null = selectedIndex < 0 ? null : allTabs[selectedIndex + 1] ?? null;

    if (found === null && wrap)
      found = allTabs.find(t => t !== this._selectedTab) ?? null;

    return found !== null && this.selectTabInternal(found);
  }

  private selectTabInternal(tab: TabItem<T> | null): boolean {
    if (tab === this._selectedTab)
      return false;

    this.current.value = tab !== null ? tab.value : (undefined as T);
    return true;
  }

  private readonly activationRequestedHandler = (tab: TabItem<T>): void => {
    if (this.current.disabled)
      return;

    this.selectTab(tab);
  };

  private readonly performTabSort = (tab: TabItem<T>): void => {
    this.tabContainer.setLayoutPosition(tab, this.getTabDepth(tab));

    // IsPresent of TabItems is based on Y position.
    // We reset it here to allow tabs to get a correct initial position.
    tab.y = 0;
  };

  private getTabDepth(tab: TabItem<T>): number {
    return tab.pinned ? -Number.MAX_VALUE : --this.depthCounter;
  }

  onPressed(e: KeyBindingPressEvent<PlatformAction>): boolean {
    if (this.isSwitchable) {
      switch (e.action) {
        case PlatformAction.DocumentNext:
          this.switchTab(1);
          return true;

        case PlatformAction.DocumentPrevious:
          this.switchTab(-1);
          return true;
      }
    }

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<PlatformAction>): void {
  }

  protected createTabFlow(): TabFillFlowContainer<T> {
    return new TabFillFlowContainer<T>().with({
      direction: FillDirection.Full,
      relativeSizeAxes: Axes.Both,
      depth: -1,
      masking: true,
    });
  }
}

/** (TabControl.TabFillFlowContainer) */
export class TabFillFlowContainer<T> extends FillFlowContainer<TabItem<T>> {
  private _allowMultiline = false;

  /** Whether tabs should be allowed to flow beyond a single line. If set to false, overflowing tabs will be automatically hidden. */
  get allowMultiline(): boolean {
    return this._allowMultiline;
  }

  set allowMultiline(value: boolean) {
    if (value === this._allowMultiline)
      return;

    this._allowMultiline = value;
    this.invalidateLayout();
  }

  /** Gets called whenever the visibility of a tab in this container changes. Provides the tab whose visibility changed. */
  tabVisibilityChanged: ((tab: TabItem<T>, isVisible: boolean) => void) | null = null;

  /** The list of tabs currently displayed by this container. */
  get tabItems(): TabItem<T>[] {
    return this.flowingChildren as TabItem<T>[];
  }

  /** The list of tabs in this container, including the tabs which are currently hidden. */
  get allTabItems(): TabItem<T>[] {
    return this.getFlowingTabs(this.aliveInternalChildren) as TabItem<T>[];
  }

  // The flowing children should only contain the present children, but we also need to consider the non-present children for retrieving all tab items.
  // So the ordering is delegated to a separate method (getFlowingTabs()).
  override get flowingChildren(): Drawable[] {
    return this.getFlowingTabs(this.aliveInternalChildren.filter(d => d.isPresent));
  }

  /** Gets the order of the tabs in this container. */
  getFlowingTabs(tabs: readonly Drawable[]): Drawable[] {
    return [...tabs].sort((a, b) => (this.getLayoutPosition(a) - this.getLayoutPosition(b)) || (a.childID - b.childID));
  }

  protected override *computeLayoutPositions(): Iterable<Vector2> {
    for (const child of this.children)
      child.y = 0;

    const result = [...super.computeLayoutPositions()];
    let i = 0;

    for (const child of this.flowingChildren as TabItem<T>[]) {
      const isVisible = this._allowMultiline || result[i].y === 0;
      this.updateChildIfNeeded(child, isVisible);

      yield result[i];

      i++;
    }
  }

  private readonly tabVisibility = new Map<TabItem<T>, boolean>();

  private updateChildIfNeeded(child: TabItem<T>, isVisible: boolean): void {
    const currentVisibility = this.tabVisibility.get(child);

    if (currentVisibility === undefined || currentVisibility !== isVisible) {
      this.tabVisibilityChanged?.(child, isVisible);
      this.tabVisibility.set(child, isVisible);

      if (isVisible)
        child.show();
      else
        child.hide();
    }
  }

  override clear(disposeChildren = true): void {
    this.tabVisibility.clear();
    super.clear(disposeChildren);
  }

  override remove(drawable: TabItem<T>, disposeImmediately: boolean): boolean {
    this.tabVisibility.delete(drawable);
    return super.remove(drawable, disposeImmediately);
  }
}
