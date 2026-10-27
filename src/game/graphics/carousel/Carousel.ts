// Ported from osu.Game/Graphics/Carousel/Carousel.cs
// The filter runs on the update thread (there are no worker threads here); like C#'s Task.Run it is asynchronous, so each filter may await.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { BindableList } from '@fw/bindables/BindableList';
import type { NotifyCollectionChangedEvent } from '@fw/bindables/BindableList';
import { Cached } from '@fw/caching/Cached';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import type { Drawable } from '@fw/graphics/Drawable';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { KeyDownEvent } from '@fw/input/events/UIEvents';
import { Key } from '@fw/input/Key';
import { Axes, Invalidation } from '@fw/layout/Enums';
import type { InvalidationSource } from '@fw/layout/Layout';
import { intersects } from '@fw/layout/Primitives';
import { dampContinuously } from '@fw/transforms/Interpolation';
import { Easing } from '@fw/transforms/Easing';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OsuGameBase } from '../../OsuGameBase';
import { type CancellationToken, CarouselItem, type ICarouselFilter, type ICarouselPanel, isCarouselPanel } from './CarouselItem';
import { CarouselScrollContainer } from './CarouselScrollContainer';

/**
 * Bookkeeping for a current selection.
 * model: the selected model. If null, there's no selection.
 * carouselItem: a related carousel item representation for the model. May be null if selection is not present as an item, or if refreshAfterSelection has not been run yet.
 * yPosition: the Y position of the selection as of the last run of refreshAfterSelection.
 * index: the index of the selection as of the last run of refreshAfterSelection.
 */
export class Selection {
  constructor(
    readonly model: unknown = null,
    readonly carouselItem: CarouselItem | null = null,
    readonly yPosition: number | null = null,
    readonly index: number | null = null,
  ) {}

  /** `this with { CarouselItem = item, Index = index }` */
  withItem(carouselItem: CarouselItem, index: number): Selection {
    return new Selection(this.model, carouselItem, this.yPosition, index);
  }

  with(o: { yPosition?: number | null }): Selection {
    return new Selection(this.model, this.carouselItem, o.yPosition !== undefined ? o.yPosition : this.yPosition, this.index);
  }
}

class DisplayRange {
  static readonly EMPTY = new DisplayRange(-1, -1);

  constructor(readonly first: number, readonly last: number) {}

  equals(other: DisplayRange | null): boolean {
    return other !== null && other.first === this.first && other.last === this.last;
  }
}

enum TraversalType {
  Keyboard,
  Set,
  Page,
  Edge,
  Group,
}

interface TraversalOperation {
  readonly type: TraversalType;
  readonly direction: number;
}

enum PendingScrollOperation {
  None,
  Standard,
  Immediate,
}

class CancellationTokenSource implements CancellationToken {
  isCancellationRequested = false;

  cancel(): void {
    this.isCancellationRequested = true;
  }
}

const traversal = (type: TraversalType, direction: number): TraversalOperation => ({ type, direction });

/** A highly efficient vertical list display that is used primarily for the song select screen, but flexible enough to be used for other use cases. */
export abstract class Carousel<T> extends CompositeDrawable implements IKeyBindingHandler<GlobalAction> {
  readonly keyBindingActionTypes = [GlobalAction];

  // #region Properties and methods for external usage

  /** Called after a filter operation or change in items results in the visible carousel items changing. */
  newItemsPresented: ((items: readonly CarouselItem[]) => void) | null = null;

  /** Height of the area above the carousel that should be treated as visible due to transparency of elements in front of it. */
  bleedTop = 0;

  /** Height of the area below the carousel that should be treated as visible due to transparency of elements in front of it. */
  bleedBottom = 0;

  /** The number of pixels outside the carousel's vertical bounds to manifest drawables. This allows preloading content before it scrolls into view. */
  distanceOffscreenToPreload = 0;

  /**
   * When a new request arrives to change filtering, the number of milliseconds to wait before performing the filter.
   * Regardless of any external debouncing, this is a safety measure to avoid triggering too many threaded operations.
   */
  debounceDelay = 0;

  private filterRunning = false;

  /** Whether an asynchronous filter / group operation is currently underway. */
  get isFiltering(): boolean {
    return this.filterRunning;
  }

  /** Whether absolute scrolling is currently triggered. */
  get absoluteScrolling(): boolean {
    return this.scroll.absoluteScrolling;
  }

  private _filterCount = 0;

  /** The number of times filter operations have been triggered. */
  get filterCount(): number {
    return this._filterCount;
  }

  /** The number of displayable items currently being tracked (before filtering). */
  get itemsTracked(): number {
    return this.items.count;
  }

  /** The items currently in rotation for display. */
  get displayableItems(): number {
    return this.carouselItems?.length ?? 0;
  }

  /** The number of items currently actualised into drawables. */
  get visibleItems(): number {
    return this.scroll.panels.children.length;
  }

  /**
   * The currently selected model. Generally of type T.
   * The selection is never reset due to not existing. It can be set to anything.
   * If no matching carousel item exists, there will be no visually selected item while waiting for potential new item which matches.
   */
  protected get currentSelection(): unknown {
    return this._currentSelection.model;
  }

  protected set currentSelection(value: unknown) {
    if (!this.checkModelEquality(this._currentSelection.model, value)) {
      this.handleItemSelected(value);

      if (this._currentSelection.model !== null)
        this.handleItemDeselected(this._currentSelection.model);

      this._currentSelection = new Selection(value);
      this.currentKeyboardSelection = this._currentSelection;
      this.selectionValid.invalidate();
    }

    // Check keyboard selection equality separately.
    //
    // If current selection set to an already-selected value, we want to ensure
    // that keyboard selection (which basically represents the "visual" tracking of selection)
    // is still reset back to the newly set value.
    //
    // The main case this handles is when a set header is clicked and we want to make sure one of its
    // "children" are re-selected.
    if (!this.checkModelEquality(this.currentKeyboardSelection.model, value)) {
      this.currentKeyboardSelection = this._currentSelection;
      this.selectionValid.invalidate();
    }
  }

  /** Activate the specified item. */
  activate(item: CarouselItem): void {
    // Regardless of how the item handles activation, update keyboard selection to the activated panel.
    // In other words, when a panel is clicked, keyboard selection should default to matching the clicked
    // item.
    this.setKeyboardSelection(item.model);

    const panel = this.getMaterialisedDrawableForItem(item);
    if (panel !== null && isCarouselPanel(panel))
      panel.activated();

    this.handleItemActivated(item);

    this.selectionValid.invalidate();
  }

  /**
   * Scroll carousel to the selected item if available.
   * @param immediate Whether the scroll position should immediately be shifted to the target, delegating animation to visible panels.
   * This should be true for operations like filtering - where panels are changing visibility state - to avoid large jumps in animation.
   */
  scrollToSelection(immediate = false): void {
    // if an immediate scroll is already requested, don't override it with a slower scroll
    if (this.pendingScrollToSelection === PendingScrollOperation.Immediate)
      return;

    this.pendingScrollToSelection = immediate ? PendingScrollOperation.Immediate : PendingScrollOperation.Standard;
  }

  /** Returns the vertical spacing between two given carousel items. Negative value can be used to create an overlapping effect. */
  protected getSpacingBetweenPanels(_top: CarouselItem, _bottom: CarouselItem): number {
    return 0;
  }

  // #endregion

  // #region Properties and methods concerning implementations

  /**
   * A collection of filters which should be run each time a filterAsync is executed.
   * Importantly, each filter is sequentially run in the order provided. Each filter receives the output of the previous filter.
   * A filter may add, mutate or remove items.
   */
  filters: readonly ICarouselFilter[] = [];

  /**
   * All items which are to be considered for display in this carousel.
   * Mutating this list will automatically queue a filterAsync.
   */
  protected readonly items = new BindableList<T>();

  /**
   * Queue an asynchronous filter operation.
   * @param clearExistingPanels Whether all existing drawable panels should be reset post filter.
   */
  protected filterAsync(clearExistingPanels = false): Promise<CarouselItem[]> {
    this._filterCount++;

    if (clearExistingPanels)
      this.filterReusesPanels.invalidate();

    this.filterAfterItemsChanged.validate();

    const task = this.performFilter();
    this.filterTask = task;
    this.filterRunning = true;
    void task.finally(() => {
      if (this.filterTask === task)
        this.filterRunning = false;
    });

    return task;
  }

  /** Called when items changes in any way. Returns whether a re-filter is required. */
  protected handleItemsChanged(_args: NotifyCollectionChangedEvent<T>): boolean {
    return true;
  }

  /** Fired after a filter operation completed. */
  protected handleFilterCompleted(): void {
  }

  /** Check whether two models are the same for display purposes. */
  protected checkModelEquality(x: unknown, y: unknown): boolean {
    return x === y;
  }

  /**
   * Create a drawable for the given carousel item so it can be displayed.
   * For efficiency, it is recommended the drawables are retrieved from a DrawablePool.
   */
  protected abstract getDrawableForDisplay(item: CarouselItem): Drawable;

  /** Given a CarouselItem, find a drawable representation if it is currently displayed in the carousel ("on-screen"). */
  protected getMaterialisedDrawableForItem(item: CarouselItem): Drawable | null {
    return this.scroll.panels.children.find(p => isCarouselPanel(p) && p.item === item) ?? null;
  }

  /** When a user is traversing the carousel via group selection keys, assert whether the item provided is a valid target. */
  protected checkValidForGroupSelection(_item: CarouselItem): boolean {
    return false;
  }

  /** When a user is traversing the carousel via set selection keys, assert whether the item provided is a valid target. */
  protected checkValidForSetSelection(_item: CarouselItem): boolean {
    return true;
  }

  /**
   * Keyboard selection usually does not automatically activate an item. There may be exceptions to this rule.
   * Returning true here will make keyboard traversal act like set traversal for the target item.
   */
  protected shouldActivateOnKeyboardSelection(_item: CarouselItem): boolean {
    return false;
  }

  /** Called after an item becomes the currentSelection. Should be used to handle any set expansion, item visibility changes, etc. */
  protected handleItemSelected(_model: unknown): void {
  }

  /** Called when the currentSelection changes to a new selection. Should be used to handle any set expansion, item visibility changes, etc. */
  protected handleItemDeselected(_model: unknown): void {
  }

  /**
   * Called when an item is activated via user input (keyboard traversal or a mouse click).
   * An activated item should decide to perform an action, such as:
   * - Change its expanded state (and show / hide children items).
   * - Set the item to the currentSelection.
   * - Start gameplay on a beatmap difficulty if already selected.
   */
  protected handleItemActivated(_item: CarouselItem): void {
  }

  // #endregion

  // #region Initialisation

  protected readonly scroll: CarouselScrollContainer;

  protected constructor() {
    super();

    this.internalChild = this.scroll = new CarouselScrollContainer().with({
      masking: false,
      relativeSizeAxes: Axes.Both,
      onPageUp: () => this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Page, -1)),
      onPageDown: () => this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Page, 1)),
      onListStart: () => this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Edge, -1)),
      onListEnd: () => this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Edge, 1)),
    });

    this.items.bindCollectionChanged((_, args) => {
      if (this.handleItemsChanged(args))
        this.filterAfterItemsChanged.invalidate();
    });
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.loadSamples(dependencies.resolve(AudioManager));
    return r;
  }

  // #endregion

  // #region Filtering and display preparation

  /** Retrieve a list of all CarouselItems currently displayed. */
  getCarouselItems(): readonly CarouselItem[] | null {
    return this.carouselItems;
  }

  private carouselItems: CarouselItem[] | null = null;

  private filterTask: Promise<CarouselItem[]> = Promise.resolve([]);
  private cancellationSource = new CancellationTokenSource();

  /**
   * For background re-filters, ensure we wait for the previous filter operation to complete before starting another.
   * This avoids the carousel never updating its display in high churn scenarios.
   */
  private readonly filterAfterItemsChanged = new Cached();

  private async performFilter(): Promise<CarouselItem[]> {
    const cts = new CancellationTokenSource();

    const previousCancellationSource = this.cancellationSource;
    this.cancellationSource = cts;
    previousCancellationSource.cancel();

    if (this.debounceDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.debounceDelay));

      if (cts.isCancellationRequested)
        return [];
    }

    let items = this.items.toArray().map(m => new CarouselItem(m));

    for (const filter of this.filters) {
      items = await filter.run(items, cts);

      if (cts.isCancellationRequested)
        return [];
    }

    this.updateYPositions(items, this.visibleHalfHeight);

    if (cts.isCancellationRequested)
      return [];

    this.schedule(() => {
      this.carouselItems = items;
      this.displayedRange = null;

      if (!this.filterReusesPanels.isValid) {
        for (const panel of [...this.scroll.panels.children])
          this.expirePanel(panel);

        this.filterReusesPanels.validate();
      }

      this.handleFilterCompleted();

      this.refreshAfterSelection();
      if (!this.scroll.userScrolling)
        this.scrollToSelection(true);

      this.newItemsPresented?.(this.carouselItems);
    });

    return items;
  }

  private updateYPositions(carouselItems: readonly CarouselItem[], offset: number): void {
    const state = { previousVisible: null as CarouselItem | null, offset };

    for (const item of carouselItems)
      this.updateItemYPosition(item, state);
  }

  private updateItemYPosition(item: CarouselItem, state: { previousVisible: CarouselItem | null; offset: number }): void {
    const spacing = state.previousVisible === null || !item.isVisible ? 0 : this.getSpacingBetweenPanels(state.previousVisible, item);

    state.offset = Math.fround(state.offset + spacing);
    item.carouselYPosition = state.offset;

    // ensure there are no input gaps where clicking will fall through the carousel.
    // notably, only do this where there's positive spacing between panels (negative spacing means they overlap already and there is no gap to fill).
    if (spacing > 0) {
      item.carouselInputLenienceAbove = spacing / 2;
      if (state.previousVisible !== null)
        state.previousVisible.carouselInputLenienceBelow = item.carouselInputLenienceAbove;
    }

    if (item.isVisible) {
      state.offset = Math.fround(state.offset + item.drawHeight);
      state.previousVisible = item;
    }
  }

  // #endregion

  // #region Input handling

  protected override onKeyDown(e: KeyDownEvent): boolean {
    switch (e.key) {
      // this is a special hard-coded case; we can't rely on OnPressed as GlobalActionContainer is
      // matching with exact modifier consideration (so Ctrl+Enter would be ignored).
      case Key.Enter:
      case Key.KeypadEnter:
        return this.activateSelection();
    }

    return super.onKeyDown(e);
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    switch (e.action) {
      case GlobalAction.Select:
        return this.activateSelection();

      // the selection traversal handlers below are scheduled to avoid an issue
      // wherein if the update frame rate is low, keeping one of the actions below pressed leads to selection moving back to the start / end.
      // the reason why that happens is that the code managing `current(Keyboard)?Selection` can lose track of the index of the selected item
      // if the selection is changed more than once during an update frame,
      // which can happen if repeat inputs are enqueued for processing at a rate faster than the update refresh rate.
      // `refreshAfterSelection()` is the method responsible for updating the index of the selected item here which runs once per frame.
      case GlobalAction.SelectPrevious:
        this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Keyboard, -1));
        return true;

      case GlobalAction.SelectNext:
        this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Keyboard, 1));
        return true;

      case GlobalAction.ActivatePreviousSet:
        this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Set, -1));
        return true;

      case GlobalAction.ActivateNextSet:
        this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Set, 1));
        return true;

      case GlobalAction.ExpandPreviousGroup:
        this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Group, -1));
        return true;

      case GlobalAction.ExpandNextGroup:
        this.scheduler.addOnce(this.traverseFromKey, traversal(TraversalType.Group, 1));
        return true;

      case GlobalAction.ToggleCurrentGroup: {
        const carouselItems = this.carouselItems;

        if (carouselItems === null || carouselItems.length === 0)
          return true;

        const keyboardItem = this.currentKeyboardSelection.carouselItem;
        const keyboardIndex = this.currentKeyboardSelection.index;

        if (keyboardItem === null || keyboardIndex === null)
          return true;

        if (this.checkValidForGroupSelection(keyboardItem)) {
          // If keyboard selection is a group, toggle group and then change keyboard selection to actual selection.
          this.activate(keyboardItem);
        } else {
          // If current keyboard selection is not a group, toggle the closest group and move keyboard selection to that group.
          for (let i = keyboardIndex; i >= 0; i--) {
            const newItem = carouselItems[i];

            if (this.checkValidForGroupSelection(newItem)) {
              this.activate(newItem);
              return true;
            }
          }
        }

        return true;
      }
    }

    return false;
  }

  // (a field so that Scheduler.AddOnce sees the same delegate each time)
  private readonly traverseFromKey = (t: TraversalOperation): void => {
    switch (t.type) {
      case TraversalType.Keyboard:
        this.traverseKeyboardSelection(t.direction);
        break;

      case TraversalType.Page:
        this.traverseKeyboardPage(t.direction);
        break;

      case TraversalType.Edge:
        this.traverseKeyboardEdge(t.direction);
        break;

      case TraversalType.Set:
        this.traverseSetSelection(t.direction);
        break;

      case TraversalType.Group:
        this.traverseGroupSelection(t.direction);
        break;
    }
  };

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }

  private activateSelection(): boolean {
    if (this.currentKeyboardSelection.carouselItem !== null) {
      this.activate(this.currentKeyboardSelection.carouselItem);
      return true;
    }

    return false;
  }

  private traverseKeyboardSelection(direction: number): void {
    const carouselItems = this.carouselItems;
    if (carouselItems === null || carouselItems.length === 0) return;

    let originalIndex: number;

    if (this.currentKeyboardSelection.index !== null)
      originalIndex = this.currentKeyboardSelection.index;
    else if (direction > 0)
      originalIndex = carouselItems.length - 1;
    else
      originalIndex = 0;

    let newIndex = originalIndex;

    // Iterate over every item back to the current selection, finding the first valid item.
    // The fail condition is when we reach the selection after a cyclic loop over every item.
    do {
      newIndex = (newIndex + direction + carouselItems.length) % carouselItems.length;
      const newItem = carouselItems[newIndex];

      if (newItem.isVisible) {
        if (!this.checkModelEquality(this._currentSelection.model, newItem.model) && this.shouldActivateOnKeyboardSelection(newItem))
          this.activate(newItem);
        else {
          this.playTraversalSound();
          this.setKeyboardSelection(newItem.model);
        }

        return;
      }
    } while (newIndex !== originalIndex);
  }

  /** Performs a page-wise keyboard traversal in the carousel, moving the selection by approximately one "page" of items. */
  private traverseKeyboardPage(direction: number): void {
    const carouselItems = this.carouselItems;
    if (carouselItems === null || carouselItems.length === 0)
      return;

    const startIndex = this.currentKeyboardSelection.index ?? (direction > 0 ? carouselItems.length - 1 : 0);

    // Compute the number of visible panels to treat as one page.
    // Reduced by 50% to account for the search bar covering the top items.
    const visiblePanelsCount = Math.max(1, Math.trunc(this.scroll.panels.children.length / 2));
    let visibleCount = 0;
    let i = startIndex;

    while (i >= 0 && i < carouselItems.length) {
      i += direction;

      if (i < 0 || i >= carouselItems.length)
        break;

      const item = carouselItems[i];

      if (!item.isVisible)
        continue;

      visibleCount++;

      if (visibleCount >= visiblePanelsCount) {
        this.setKeyboardSelection(item.model);
        this.scrollToSelection();
        this.playTraversalSound();
        return;
      }
    }

    // If we are at the beginning or end and there are not enough items left to scroll through a complete page, then we go to the last or first item.
    const fallback = direction > 0
      ? carouselItems.findLast(x => x.isVisible)
      : carouselItems.find(x => x.isVisible);

    if (fallback !== undefined && !this.checkModelEquality(fallback.model, this.currentKeyboardSelection.model)) {
      this.setKeyboardSelection(fallback.model);
      this.scrollToSelection();
      this.playTraversalSound();
    }
  }

  /** Select the first or last item in the carousel. Positive direction for last item, negative for first item. */
  private traverseKeyboardEdge(direction: number): void {
    const carouselItems = this.carouselItems;
    if (carouselItems === null || carouselItems.length === 0)
      return;

    const item = direction > 0
      ? carouselItems.findLast(x => x.isVisible)
      : carouselItems.find(x => x.isVisible);

    if (item !== undefined && !this.checkModelEquality(item.model, this.currentKeyboardSelection.model)) {
      this.setKeyboardSelection(item.model);
      this.scrollToSelection();
      this.playTraversalSound();
    }
  }

  /** Select the next valid group selection relative to a current selection. This is generally for keyboard based traversal. */
  private traverseGroupSelection(direction: number): void {
    this.traverseSelection(direction, item => this.checkValidForGroupSelection(item));
  }

  /** Select the next valid set selection relative to a current selection. This is generally for keyboard based traversal. */
  private traverseSetSelection(direction: number): void {
    // If the user has a different keyboard selection and requests
    // set selection, first transfer the keyboard selection to actual selection.
    //
    // It is assumed that selecting a set will immediately change selection to one of its children.
    if (this.currentKeyboardSelection.carouselItem !== null && this._currentSelection.carouselItem !== this.currentKeyboardSelection.carouselItem) {
      this.activate(this.currentKeyboardSelection.carouselItem);
      return;
    }

    this.traverseSelection(direction, item => this.checkValidForSetSelection(item));
  }

  private traverseSelection(direction: number, predicate: (item: CarouselItem) => boolean): void {
    const carouselItems = this.carouselItems;
    if (carouselItems === null || carouselItems.length === 0) return;

    let originalIndex: number;
    let newIndex: number;

    if (this.currentKeyboardSelection.index === null) {
      // If there's no current selection, start from either end of the full list.
      newIndex = originalIndex = direction > 0 ? carouselItems.length - 1 : 0;
    } else {
      newIndex = originalIndex = this.currentKeyboardSelection.index;

      // As a second special case, if we're set selecting backwards and the current selection isn't a set,
      // make sure to go back to the set header this item belongs to, so that the block below doesn't find it and stop too early.
      if (direction < 0) {
        while (newIndex > 0 && !predicate(carouselItems[newIndex]))
          newIndex--;
      }
    }

    // Iterate over every item back to the current selection, finding the first valid item.
    // The fail condition is when we reach the selection after a cyclic loop over every item.
    for (;;) {
      newIndex = (newIndex + direction + carouselItems.length) % carouselItems.length;

      if (newIndex === originalIndex)
        break;

      const newItem = carouselItems[newIndex];

      if (!newItem.isExpanded && predicate(newItem)) {
        this.activate(newItem);
        return;
      }
    }
  }

  // #endregion

  // #region Scrolling

  /**
   * Scrolling to selection relies on currentKeyboardSelection being fully populated.
   * This flag ensures it runs after refreshAfterSelection validates this.
   */
  private pendingScrollToSelection = PendingScrollOperation.None;

  // #endregion

  // #region Audio

  private sampleKeyboardTraversal: Sample | null = null;

  private audioFeedbackLastPlaybackTime = 0;

  private loadSamples(audio: AudioManager): void {
    void audio.samples.get('SongSelect/select-difficulty').then(s => this.sampleKeyboardTraversal = s);
  }

  private playTraversalSound(): void {
    if (this.time.current - this.audioFeedbackLastPlaybackTime >= OsuGameBase.SAMPLE_DEBOUNCE_TIME) {
      this.sampleKeyboardTraversal?.play();
      this.audioFeedbackLastPlaybackTime = this.time.current;
    }
  }

  // #endregion

  // #region Selection handling

  /** The currently selected CarouselItem, if any is selected. */
  protected get currentSelectionItem(): CarouselItem | null {
    return this._currentSelection.carouselItem;
  }

  /** The index in getCarouselItems of the current selection, if available. */
  protected get currentSelectionIndex(): number | null {
    return this._currentSelection.index;
  }

  /** Becomes invalid when the current selection has changed and needs to be updated visually. */
  private readonly selectionValid = new Cached();

  private currentKeyboardSelection = new Selection();
  private _currentSelection = new Selection();

  private setKeyboardSelection(model: unknown): void {
    this.currentKeyboardSelection = new Selection(model);
    this.selectionValid.invalidate();
  }

  /** Call after a selection of items change to re-attach CarouselItems to current Selections. */
  private refreshAfterSelection(): void {
    const state = { previousVisible: null as CarouselItem | null, offset: this.visibleHalfHeight };

    // Invalidate display range as panel positions and visible status may have changed.
    // Position transfer won't happen unless we invalidate this.
    this.displayedRange = null;

    const prevKeyboard = this.currentKeyboardSelection;

    // Importantly, we also reset the `Selection` to the most basic state.
    // Removing the index and carousel item here is important to ensure we are aware of if a selection has been filtered away.
    // If it hasn't been filtered, the full details will be re-populated just below in the loop.
    this.currentKeyboardSelection = new Selection(this.currentKeyboardSelection.model);
    this._currentSelection = new Selection(this._currentSelection.model);

    const carouselItems = this.carouselItems;

    if (carouselItems === null)
      return;

    // We are performing two important operations here:
    // - Update all Y positions. After a selection occurs, panels may have changed visibility state and therefore Y positions.
    // - Link selected models to CarouselItems. If a selection changed, this is where we find the relevant CarouselItems for further use.
    const found = this.findCarouselItemsForSelection(this.currentKeyboardSelection, this._currentSelection, carouselItems);
    this.currentKeyboardSelection = found.keyboardSelection;
    this._currentSelection = found.selection;

    for (const item of carouselItems)
      this.updateItemYPosition(item, state);

    const keyboardItem = this.currentKeyboardSelection.carouselItem;
    if (keyboardItem !== null)
      this.currentKeyboardSelection = this.currentKeyboardSelection.with({ yPosition: keyboardItem.carouselYPosition + keyboardItem.drawHeight / 2 });

    const selectionItem = this._currentSelection.carouselItem;
    if (selectionItem !== null)
      this._currentSelection = this._currentSelection.with({ yPosition: selectionItem.carouselYPosition + selectionItem.drawHeight / 2 });

    // Update the total height of all items (to make the scroll container scrollable through the full height even though
    // most items are not displayed / loaded).
    this.scroll.setLayoutHeight(state.offset + this.visibleHalfHeight);

    // If a keyboard selection is currently made, we want to keep the view stable around the selection.
    // That means that we should offset the immediate scroll position by any change in Y position for the selection.
    const yPosition = this.currentKeyboardSelection.yPosition;
    if (prevKeyboard.yPosition !== null && yPosition !== null && yPosition !== prevKeyboard.yPosition)
      this.scroll.offsetScrollPosition(Math.fround(yPosition - prevKeyboard.yPosition));
  }

  protected findCarouselItemsForSelection(keyboardSelection: Selection, selection: Selection, items: readonly CarouselItem[]): { keyboardSelection: Selection; selection: Selection } {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const isKeyboardSelection = this.checkModelEquality(item.model, keyboardSelection.model);
      const isSelection = this.checkModelEquality(item.model, selection.model);

      // while we don't know the Y position of the item yet, as it's about to be updated,
      // consumers (specifically `BeatmapCarousel.GetSpacingBetweenPanels()`) benefit from `CurrentSelectionItem` already pointing
      // at the correct item to avoid redundant local equality checks.
      // the Y positions will be filled in after they're computed.
      if (isKeyboardSelection)
        keyboardSelection = new Selection(keyboardSelection.model, item, null, i);

      if (isSelection)
        selection = new Selection(selection.model, item, null, i);
    }

    // (C# passes the selections by ref; the caller assigns them back before the Y layout that follows.)
    return { keyboardSelection, selection };
  }

  // #endregion

  // #region Display handling

  private displayedRange: DisplayRange | null = null;

  private readonly carouselBoundsItem = new CarouselItem({});

  /** The position of the lower visible bound with respect to the current scroll position. */
  private visibleBottomBound = 0;

  /** The position of the upper visible bound with respect to the current scroll position. */
  private visibleUpperBound = 0;

  /** Half the height of the visible content. */
  private visibleHalfHeight = 0;

  /** Whether existing panels can be re-used in the next filter. */
  private readonly filterReusesPanels = new Cached();

  protected override update(): void {
    super.update();

    if (this.carouselItems === null)
      return;

    this.visibleBottomBound = Math.fround(this.scroll.current + this.drawHeight + this.bleedBottom);
    this.visibleUpperBound = Math.fround(this.scroll.current - this.bleedTop);
    this.visibleHalfHeight = Math.fround((this.drawHeight + this.bleedBottom + this.bleedTop) / 2);

    if (!this.selectionValid.isValid) {
      this.refreshAfterSelection();

      // Always scroll to selection in this case (regardless of `UserScrolling` state), centering the selection.
      this.scrollToSelection();

      this.selectionValid.validate();
    }

    const range = this.getDisplayRange();

    if (!range.equals(this.displayedRange)) {
      this.displayedRange = range;
      this.updateDisplayedRange(range);
    }

    const selectedYPos = this._currentSelection.carouselItem?.carouselYPosition ?? 0;

    for (const panel of [...this.scroll.panels.children]) {
      if (!isCarouselPanel(panel))
        continue;

      const item = panel.item;

      // panel in the process of expiring, ignore it.
      if (item === null)
        continue;

      const normalisedDepth = Math.fround(Math.abs(selectedYPos - item.carouselYPosition) / this.drawHeight);
      this.scroll.panels.changeChildDepth(panel, item.depthLayer + normalisedDepth);

      if (panel.drawYPosition !== item.carouselYPosition)
        panel.drawYPosition = dampContinuously(panel.drawYPosition, item.carouselYPosition, 50, this.time.elapsed);

      panel.x = this.getPanelXOffset(panel);

      panel.selected.value = this._currentSelection.carouselItem !== null && this.checkModelEquality(item, this._currentSelection.carouselItem);
      panel.keyboardSelected.value = item === this.currentKeyboardSelection.carouselItem;
      panel.expanded.value = item.isExpanded;
    }

    if (!this.filterAfterItemsChanged.isValid && !this.isFiltering)
      void this.filterAsync();
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    if (this.pendingScrollToSelection !== PendingScrollOperation.None) {
      const scrollTarget = this.getScrollTarget();
      if (scrollTarget !== null)
        this.scroll.scrollTo(scrollTarget - this.visibleHalfHeight + this.bleedTop, this.pendingScrollToSelection === PendingScrollOperation.Standard);

      this.pendingScrollToSelection = PendingScrollOperation.None;
    }
  }

  /** Returns the Y position to scroll to in order to show the most relevant carousel item(s). */
  protected getScrollTarget(): number | null {
    return this.currentKeyboardSelection.yPosition;
  }

  protected getPanelXOffset(panel: Drawable): number {
    const posInScroll = this.scroll.toLocalSpace(panel.screenSpaceDrawQuad.centre);
    const dist = Math.abs(1 - (posInScroll.y + this.bleedTop) / this.visibleHalfHeight);

    return Carousel.offsetX(dist, this.visibleHalfHeight);
  }

  /**
   * Computes the x-offset of currently visible items. Makes the carousel appear round.
   * @param dist Vertical distance from the center of the carousel container ranging from -1 to 1.
   * @param halfHeight Half the height of the carousel container.
   */
  private static offsetX(dist: number, halfHeight: number): number {
    // The radius of the circle the carousel moves on.
    const circle_radius = 3;
    const discriminant = Math.max(0, circle_radius * circle_radius - dist * dist);
    return Math.fround((circle_radius - Math.sqrt(discriminant)) * halfHeight);
  }

  private getDisplayRange(): DisplayRange {
    const carouselItems = this.carouselItems!;

    if (carouselItems.length === 0)
      return DisplayRange.EMPTY;

    // Find index range of all items that should be on-screen
    this.carouselBoundsItem.carouselYPosition = this.visibleUpperBound - this.distanceOffscreenToPreload;
    const firstIndex = lowerBound(carouselItems, this.carouselBoundsItem);

    this.carouselBoundsItem.carouselYPosition = this.visibleBottomBound + this.distanceOffscreenToPreload;
    const lastIndex = lowerBound(carouselItems, this.carouselBoundsItem);

    return new DisplayRange(Math.max(0, firstIndex - 1), Math.max(0, lastIndex - 1));
  }

  private updateDisplayedRange(range: DisplayRange): void {
    const carouselItems = this.carouselItems!;

    const toDisplay = range.equals(DisplayRange.EMPTY)
      ? []
      : carouselItems.slice(range.first, range.last + 1).filter(i => i.isVisible);

    // Iterate over all panels which are already displayed and figure which need to be displayed / removed.
    for (const panel of [...this.scroll.panels.children]) {
      if (!isCarouselPanel(panel))
        continue;

      const panelItem = panel.item;

      if (panelItem === null) {
        // Item is null when a panel is already fading away from existence; should be ignored for tracking purposes.
        continue;
      }

      const existingIndex = toDisplay.findIndex(i => this.checkModelEquality(i.model, panelItem.model));

      if (existingIndex >= 0) {
        panel.item = toDisplay[existingIndex];
        toDisplay.splice(existingIndex, 1);
        continue;
      }

      // If the new display range doesn't contain the panel, it's no longer required for display.
      this.expirePanel(panel);
    }

    // Add any new items which need to be displayed and haven't yet.
    for (const item of toDisplay) {
      const drawable = this.getDrawableForDisplay(item);

      if (!isCarouselPanel(drawable))
        throw new Error('Carousel panel drawables must implement ICarouselPanel');

      drawable.item = item;
      drawable.drawYPosition = item.carouselYPosition;

      this.scroll.add(drawable);
    }

    if (toDisplay.length > 0) {
      // To make transitions of items appearing in the flow look good, do a pass and make sure newly added items spawn from
      // just beneath the *current interpolated position* of the previous panel.
      const scrollQuad = this.scroll.screenSpaceDrawQuad;
      const orderedPanels = this.scroll.panels.children
        .filter((p): p is Drawable & ICarouselPanel => isCarouselPanel(p) && p.item !== null && intersects(scrollQuad, p.screenSpaceDrawQuad))
        .sort((a, b) => a.item!.carouselYPosition - b.item!.carouselYPosition);

      for (let i = 0; i < orderedPanels.length; i++) {
        const panel = orderedPanels[i];

        if (toDisplay.includes(panel.item!)) {
          // Don't apply to the last because animating the tail of the list looks bad.
          // It's usually off-screen anyway.
          if (i > 0 && i < orderedPanels.length - 1)
            panel.drawYPosition = orderedPanels[i - 1].drawYPosition;
        }
      }
    }
  }

  private expirePanel(panel: Drawable): void {
    if (!isCarouselPanel(panel))
      return;

    // expired panels should have a depth behind all other panels to make the transition not look weird.
    this.scroll.panels.changeChildDepth(panel, panel.depth + 1024);

    panel.fadeOut(150, Easing.OutQuint);
    panel.moveToX(panel.x + 100, 200, Easing.Out);

    panel.expire();

    panel.item = null;
    panel.selected.value = false;
    panel.keyboardSelected.value = false;
    panel.expanded.value = false;
  }

  protected override onInvalidate(invalidation: Invalidation, source: InvalidationSource): boolean {
    // handles the vertical size of the carousel changing (ie. on window resize when aspect ratio has changed).
    if ((invalidation & Invalidation.DrawSize) !== 0)
      this.selectionValid.invalidate();

    return super.onInvalidate(invalidation, source);
  }

  // #endregion
}

/** List<T>.BinarySearch followed by `if (index < 0) index = ~index`: the first index whose item is not less than the target. */
function lowerBound(items: readonly CarouselItem[], target: CarouselItem): number {
  let lo = 0;
  let hi = items.length - 1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    const c = items[mid].compareTo(target);

    if (c === 0)
      return mid;

    if (c < 0)
      lo = mid + 1;
    else
      hi = mid - 1;
  }

  return lo;
}
