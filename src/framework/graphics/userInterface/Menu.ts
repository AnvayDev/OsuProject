// Ported from osu.Framework/Graphics/UserInterface/Menu.cs
// C# events are Signals. DrawableMenuItem's content is treated as IHasText when it has a string `text` property.

import { Signal } from '../../bindables/Signal';
import type { ClickEvent, FocusLostEvent, HoverEvent, HoverLostEvent, KeyDownEvent, MouseDownEvent } from '../../input/events/UIEvents';
import { Key } from '../../input/Key';
import { Anchor, Axes, Direction, FillDirection, Invalidation } from '../../layout/Enums';
import { InvalidationSource, LayoutValue } from '../../layout/Layout';
import { Precision } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import type { ScheduledDelegate } from '../../timing/Scheduler';
import { Colour4 } from '../Colour4';
import { CompositeDrawable } from '../containers/CompositeDrawable';
import { Container } from '../containers/Container';
import { FillFlowContainer } from '../containers/FillFlowContainer';
import type { ScrollContainer } from '../containers/ScrollContainer';
import type { Drawable } from '../Drawable';
import { Box } from '../shapes/Box';
import type { MenuItem } from './MenuItem';

export enum MenuState {
  Closed,
  Open,
}

export enum MenuItemState {
  NotSelected,
  Selected,
}

/** (Menu.IItemsFlow) */
export interface IItemsFlow {
  readonly sizeCache: LayoutValue;
}

/** (Menu.ItemsFlow) */
class ItemsFlow extends FillFlowContainer<DrawableMenuItem> implements IItemsFlow {
  readonly sizeCache = new LayoutValue(Invalidation.RequiredParentSizeToFit, InvalidationSource.Self);

  constructor() {
    super();
    this.addLayout(this.sizeCache);
  }
}

const hasText = (d: Drawable): d is Drawable & { text: string } => typeof (d as unknown as { text?: unknown }).text === 'string';

/** A list of command or selection items. */
export abstract class Menu extends CompositeDrawable {
  /** Invoked when this Menu changes its MenuState. */
  readonly stateChanged = new Signal<MenuState>();

  /** Invoked when this Menu's submenu is opened. */
  readonly onSubmenuOpen = new Signal<Menu>();

  /** Gets or sets the delay before opening sub-Menus when menu items are hovered. */
  protected hoverOpenDelay = 100;

  /** Whether this menu is always displayed in an open state (ie. a menubar). Clicks are required to activate DrawableMenuItems. */
  protected readonly topLevelMenu: boolean;

  /** The ScrollContainer that holds the items of this Menu. */
  protected readonly contentContainer: ScrollContainer<Drawable>;

  // this is intentionally not a FillFlowContainer, as to not allow the consumers to mutate the layout position of menu items,
  // since we manage it ourselves to define a specific order for menu items and allow inserting ones between others.
  /** The container that provides the layout for the DrawableMenuItems that are attached to this Menu. */
  protected get itemsContainer(): Container<DrawableMenuItem> {
    return this.itemsFlow;
  }

  private itemsFlow: FillFlowContainer<DrawableMenuItem> & IItemsFlow;

  /** The container that contains the content of this Menu. */
  protected readonly maskingContainer: Container;

  /** Gets the item representations contained by this Menu (protected internal). */
  get menuChildren(): readonly DrawableMenuItem[] {
    return this.itemsFlow.children;
  }

  protected readonly direction: Direction;

  private parentMenu: Menu | null = null;
  private submenu: Menu | null = null;

  private readonly background: Box;

  private readonly submenuContainer: Container<Menu>;
  private readonly positionLayout = new LayoutValue(Invalidation.DrawInfo | Invalidation.RequiredParentSizeToFit);

  override get propagatePositionalInputSubTree(): boolean {
    return this.state === MenuState.Open;
  }

  override get handlePositionalInput(): boolean {
    return this.state === MenuState.Open;
  }

  override get handleNonPositionalInput(): boolean {
    return this.state === MenuState.Open;
  }

  /** Constructs a menu. topLevelMenu: whether the resultant menu is always open (always opened in a top-level state, e.g. a menubar). */
  protected constructor(direction: Direction, topLevelMenu = false) {
    super();

    this.direction = direction;
    this.topLevelMenu = topLevelMenu;

    if (topLevelMenu)
      this._state = MenuState.Open;

    let maskingContainer!: Container;
    let background!: Box;
    let contentContainer!: ScrollContainer<Drawable>;
    let itemsFlow!: FillFlowContainer<DrawableMenuItem> & IItemsFlow;
    let submenuContainer!: Container<Menu>;

    this.internalChildren = [
      maskingContainer = new Container().with({
        name: 'Our contents',
        relativeSizeAxes: Axes.Both,
        masking: true,
        children: [
          background = new Box().with({
            relativeSizeAxes: Axes.Both,
            colour: Colour4.Black,
          }),
          contentContainer = this.createScrollContainer(direction).with({
            relativeSizeAxes: Axes.Both,
            masking: false,
            child: itemsFlow = this.createItemsFlow(direction === Direction.Horizontal ? FillDirection.Horizontal : FillDirection.Vertical),
          }),
        ],
      }),
      submenuContainer = new Container<Menu>().with({
        name: 'Sub menu container',
        autoSizeAxes: Axes.Both,
      }),
    ];

    this.maskingContainer = maskingContainer;
    this.background = background;
    this.contentContainer = contentContainer;
    this.itemsFlow = itemsFlow;
    this.submenuContainer = submenuContainer;

    switch (direction) {
      case Direction.Horizontal:
        itemsFlow.autoSizeAxes = Axes.X;
        break;

      case Direction.Vertical:
        itemsFlow.autoSizeAxes = Axes.Y;
        break;
    }

    // The menu will provide a valid size for the items container based on our own size
    itemsFlow.relativeSizeAxes = Axes.Both & ~itemsFlow.autoSizeAxes;

    this.addLayout(this.positionLayout);
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.updateState();
  }

  /** Gets or sets the MenuItems contained within this Menu. */
  get items(): readonly MenuItem[] {
    return this.itemsFlow.children.map(r => r.item);
  }

  set items(value: readonly MenuItem[]) {
    this.clear();
    value?.forEach(i => this.add(i));
  }

  /** The background colour of this Menu. */
  get backgroundColour(): Colour4 {
    return this.background.colour.averageColour;
  }

  set backgroundColour(value: Colour4) {
    this.background.colour = value;
  }

  /** Gets or sets whether the scroll bar of this Menu should be visible. */
  get scrollbarVisible(): boolean {
    return this.contentContainer.scrollbarVisible;
  }

  set scrollbarVisible(value: boolean) {
    this.contentContainer.scrollbarVisible = value;
  }

  private _maxWidth = Number.MAX_VALUE;

  /** Gets or sets the maximum allowable width by this Menu. */
  get maxWidth(): number {
    return this._maxWidth;
  }

  set maxWidth(value: number) {
    if (Precision.almostEquals(this._maxWidth, value))
      return;

    this._maxWidth = value;

    this.itemsFlow.sizeCache.invalidate();
  }

  private _maxHeight = Number.POSITIVE_INFINITY;

  /** Gets or sets the maximum allowable height by this Menu. */
  get maxHeight(): number {
    return this._maxHeight;
  }

  set maxHeight(value: number) {
    if (Precision.almostEquals(this._maxHeight, value))
      return;

    this._maxHeight = value;

    this.itemsFlow.sizeCache.invalidate();
  }

  private _state = MenuState.Closed;

  /** Gets or sets the current state of this Menu. */
  get state(): MenuState {
    return this._state;
  }

  set state(value: MenuState) {
    if (this.topLevelMenu) {
      this.submenu?.close();
      return;
    }

    if (this._state === value)
      return;

    this._state = value;

    this.updateState();
    this.stateChanged.emit(this.state);
  }

  private updateState(): void {
    if (!this.isLoaded)
      return;

    this.resetState();

    switch (this.state) {
      case MenuState.Closed:
        this.animateClose();

        if (this.hasFocus)
          this.getContainingFocusManager()?.changeFocus(this.parentMenu);
        break;

      case MenuState.Open:
        this.contentContainer.scrollToStart(false);

        this.animateOpen();

        // We may not be present at this point, so must run on the next frame.
        if (!this.topLevelMenu) {
          this.schedule(() => {
            if (this.state === MenuState.Open) this.getContainingFocusManager()!.changeFocus(this);
          });
        }

        break;
    }
  }

  private resetState(): void {
    if (!this.isLoaded)
      return;

    this.submenu?.close();
    this.itemsFlow.sizeCache.invalidate();
  }

  /** Adds a MenuItem to this Menu. */
  add(item: MenuItem): void {
    this.insert(this.itemsFlow.children.length, item);
  }

  /** Inserts a MenuItem at a specified position inside this Menu. */
  insert(position: number, item: MenuItem): void {
    const drawableItem = this.createDrawableMenuItem(item);
    drawableItem.clicked = this.menuItemClicked;
    drawableItem.hovered = this.menuItemHovered;
    drawableItem.stateChanged.add(s => this.itemStateChanged(drawableItem, s));

    drawableItem.setFlowDirection(this.direction);

    const items = [...this.menuChildren].sort((a, b) => this.itemsFlow.getLayoutPosition(a) - this.itemsFlow.getLayoutPosition(b));

    for (let i = position; i < items.length; i++)
      this.itemsFlow.setLayoutPosition(items[i], i + 1);

    this.itemsFlow.insert(position, drawableItem);
    this.itemsFlow.sizeCache.invalidate();
  }

  private itemStateChanged(item: DrawableMenuItem, state: MenuItemState): void {
    if (state !== MenuItemState.Selected) return;

    if (item !== this.selectedItem && this.selectedItem !== null)
      this.selectedItem.state = MenuItemState.NotSelected;
    this.selectedItem = item;
  }

  /** Removes a MenuItem from this Menu. */
  remove(item: MenuItem): boolean {
    const items = [...this.menuChildren].sort((a, b) => this.itemsFlow.getLayoutPosition(a) - this.itemsFlow.getLayoutPosition(b));
    let removed = false;

    for (let i = 0; i < items.length; i++) {
      const d = items[i];

      if (d.item === item) {
        for (let j = i + 1; j < items.length; j++)
          this.itemsFlow.setLayoutPosition(items[j], j - 1);

        this.itemsFlow.remove(d, true);
        items.splice(i--, 1);
        removed = true;
      }
    }

    this.itemsFlow.sizeCache.invalidate();
    return removed;
  }

  /** Clears all MenuItems in this Menu. */
  clear(): void {
    this.itemsFlow.clear();
    this.resetState();
  }

  /** Opens this Menu. */
  open(): void {
    this.state = MenuState.Open;
  }

  /** Closes this Menu. */
  close(): void {
    this.state = MenuState.Closed;
  }

  /** Toggles the state of this Menu. */
  toggle(): void {
    this.state = this.state === MenuState.Closed ? MenuState.Open : MenuState.Closed;
  }

  /** Animates the opening of this Menu. */
  protected animateOpen(): void {
    this.show();
  }

  /** Animates the closing of this Menu. */
  protected animateClose(): void {
    this.hide();
  }

  protected override update(): void {
    super.update();

    if (!this.positionLayout.isValid && this.state === MenuState.Open && this.parentMenu !== null) {
      const inputManager = this.getContainingInputManager()!;
      const triggeringItem = this.triggeringItem!;

      // This is the default position to which this menu should be anchored to the parent menu item which triggered it (top left of the triggering item)
      const triggeringItemTopLeftPosition = triggeringItem.toSpaceOfOtherDrawable(Vector2.Zero, this.parentMenu);

      // The "maximum" position is the worst case position of the bottom right corner of this menu
      // if this menu is anchored top-left to the triggering item.
      const menuMaximumPosition = triggeringItem.toSpaceOfOtherDrawable(
        new Vector2(triggeringItem.drawWidth + this.drawWidth, triggeringItem.drawHeight + this.drawHeight), inputManager);

      // The "minimum" position is the worst case position of the top left corner of this menu
      // if this menu is anchored bottom-right to the parent menu item that triggered it.
      const menuMinimumPosition = triggeringItem.toSpaceOfOtherDrawable(new Vector2(-this.drawWidth, -this.drawHeight), inputManager);

      // We will be making anchor adjustments by changing the parent's "submenu container" to be positioned and anchored correctly to the parent menu.
      // Therefore note that all X and Y adjustments below will occur in the parent menu's coordinates.
      const parentSubmenuContainer = this.parentMenu.submenuContainer;

      const switchAxisAnchors = (originalValue: Anchor, toDisable: Anchor, toEnable: Anchor) => (originalValue & ~toDisable) | toEnable;

      if (this.parentMenu.direction === Direction.Vertical) {
        // If this menu won't fit on the screen horizontally if it's anchored to the right of its triggering item, but it will fit when anchored to the left...
        if (menuMaximumPosition.x > inputManager.drawWidth && menuMinimumPosition.x > 0) {
          // switch the origin and position of the submenu container so that it's right-aligned to the left side of the triggering item.
          parentSubmenuContainer.origin = switchAxisAnchors(parentSubmenuContainer.origin, Anchor.x0, Anchor.x2);
          parentSubmenuContainer.x = triggeringItemTopLeftPosition.x;
        } else {
          // otherwise, switch the origin and position of the submenu container so that it's left-aligned to the right side of the triggering item.
          parentSubmenuContainer.origin = switchAxisAnchors(parentSubmenuContainer.origin, Anchor.x2, Anchor.x0);
          parentSubmenuContainer.x = triggeringItemTopLeftPosition.x + triggeringItem.drawWidth;
        }

        // If this menu won't fit on the screen vertically if its top edge is aligned to the top of the triggering item,
        // but it will fit if its bottom edge is aligned to the bottom of the triggering item...
        if (menuMaximumPosition.y > inputManager.drawHeight && menuMinimumPosition.y > 0) {
          // switch the origin and position of the submenu container so that it's bottom-aligned to the bottom of the triggering item.
          parentSubmenuContainer.origin = switchAxisAnchors(parentSubmenuContainer.origin, Anchor.y0, Anchor.y2);
          parentSubmenuContainer.y = triggeringItemTopLeftPosition.y + triggeringItem.drawHeight;
        } else {
          // otherwise, switch the origin and position of the submenu container so that it's top-aligned to the top of the triggering item.
          parentSubmenuContainer.origin = switchAxisAnchors(parentSubmenuContainer.origin, Anchor.y2, Anchor.y0);
          parentSubmenuContainer.y = triggeringItemTopLeftPosition.y;
        }
      }
      // the "horizontal" case is the same as above, but with the axes everywhere swapped.
      else {
        if (menuMaximumPosition.y > inputManager.drawHeight && menuMinimumPosition.y > 0) {
          parentSubmenuContainer.origin = switchAxisAnchors(parentSubmenuContainer.origin, Anchor.y0, Anchor.y2);
          parentSubmenuContainer.y = triggeringItemTopLeftPosition.y;
        } else {
          parentSubmenuContainer.origin = switchAxisAnchors(parentSubmenuContainer.origin, Anchor.y2, Anchor.y0);
          parentSubmenuContainer.y = triggeringItemTopLeftPosition.y + triggeringItem.drawHeight;
        }

        if (menuMaximumPosition.x > inputManager.drawWidth && menuMinimumPosition.x > 0) {
          parentSubmenuContainer.origin = switchAxisAnchors(parentSubmenuContainer.origin, Anchor.x0, Anchor.x2);
          parentSubmenuContainer.x = triggeringItemTopLeftPosition.x + triggeringItem.drawWidth;
        } else {
          parentSubmenuContainer.origin = switchAxisAnchors(parentSubmenuContainer.origin, Anchor.x2, Anchor.x0);
          parentSubmenuContainer.x = triggeringItemTopLeftPosition.x;
        }
      }

      this.positionLayout.validate();
    }
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    if (!this.itemsFlow.sizeCache.isValid) {
      // Our children will be relatively-sized on the axis separate to the menu direction, so we need to compute
      // that size ourselves, based on the content size of our children, to give them a valid relative size

      let width = 0;
      let height = 0;

      for (const item of this.menuChildren) {
        width = Math.max(width, item.contentDrawWidth);
        height = Math.max(height, item.contentDrawHeight);
      }

      // When scrolling in one direction, itemsFlow is auto-sized in that direction and relative-sized in the other
      // In the case of the auto-sized direction, we want to use its size. In the case of the relative-sized direction, we want
      // to use the (above) computed size.
      width = this.direction === Direction.Horizontal ? this.itemsFlow.width : width;
      height = this.direction === Direction.Vertical ? this.itemsFlow.height : height;

      width = Math.min(this.maxWidth, width);
      height = Math.min(this.maxHeight, height);

      // Regardless of the above result, if we are relative-sizing, just use the stored width/height
      width = (this.relativeSizeAxes & Axes.X) !== 0 ? this.width : width;
      height = (this.relativeSizeAxes & Axes.Y) !== 0 ? this.height : height;

      if (this.state === MenuState.Closed && this.direction === Direction.Horizontal)
        width = 0;
      if (this.state === MenuState.Closed && this.direction === Direction.Vertical)
        height = 0;

      this.updateSize(new Vector2(width, height));

      this.itemsFlow.sizeCache.validate();
    }
  }

  /** Updates the size of this Menu. */
  protected updateSize(newSize: Vector2): void {
    this.size = newSize;
  }

  // #region Hover/Focus logic

  private readonly menuItemClicked = (item: DrawableMenuItem): void => {
    // We only want to close the sub-menu if we're not a sub menu - if we are a sub menu
    // then clicks should instead cause the sub menus to instantly show up
    if (this.topLevelMenu && this.submenu?.state === MenuState.Open) {
      this.submenu.close();
      return;
    }

    // Check if there is a sub menu to display
    if (item.item.items.length === 0) {
      // This item must have attempted to invoke an action - close all menus if item allows
      if (item.closeMenuOnClick)
        this.closeAll();

      return;
    }

    this.openDelegate?.cancel();

    this.openSubmenuFor(item);
  };

  private selectedItem: DrawableMenuItem | null = null;

  /** The menu item which triggered this Menu as a submenu. */
  private triggeringItem: DrawableMenuItem | null = null;

  private openSubmenuFor(item: DrawableMenuItem): void {
    item.state = MenuItemState.Selected;

    if (this.submenu === null) {
      this.submenuContainer.add(this.submenu = this.createSubMenu());
      this.submenu.parentMenu = this;
      this.submenu.stateChanged.add(this.submenuStateChanged);
    }

    const submenuChanged = this.submenu.triggeringItem !== item;

    this.submenu.triggeringItem = item;
    this.submenu.positionLayout.invalidate();

    this.submenu.items = item.item.items;

    if (item.item.items.length > 0) {
      if (this.submenu.state === MenuState.Open)
        this.schedule(() => this.getContainingFocusManager()!.changeFocus(this.submenu));
      else
        this.submenu.open();

      // Check if submenu has changed before firing, to prevent extraneous callbacks (e.g. re-hovering the triggeringItem of an already open submenu)
      if (submenuChanged)
        this.onSubmenuOpen.emit(this.submenu);
    } else
      this.submenu.close();
  }

  private readonly submenuStateChanged = (state: MenuState): void => {
    switch (state) {
      case MenuState.Closed:
        this.selectedItem!.state = MenuItemState.NotSelected;
        break;

      case MenuState.Open:
        this.selectedItem!.state = MenuItemState.Selected;
        break;
    }
  };

  private openDelegate: ScheduledDelegate | null = null;

  private readonly menuItemHovered = (item: DrawableMenuItem): void => {
    // If we're not a sub-menu, then hover shouldn't display a sub-menu unless an item is clicked
    if (this.topLevelMenu && this.submenu?.state !== MenuState.Open)
      return;

    this.openDelegate?.cancel();

    if (this.topLevelMenu || this.hoverOpenDelay === 0)
      this.openSubmenuFor(item);
    else {
      this.openDelegate = this.scheduler.addDelayed(() => {
        if (item.isHovered)
          this.openSubmenuFor(item);
      }, this.hoverOpenDelay);
    }
  };

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (e.key === Key.Escape && !this.topLevelMenu) {
      this.close();
      return true;
    }

    return super.onKeyDown(e);
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    return true;
  }

  protected override onClick(_e: ClickEvent): boolean {
    return true;
  }

  protected override onHover(_e: HoverEvent): boolean {
    return true;
  }

  override get acceptsFocus(): boolean {
    return !this.topLevelMenu;
  }

  override get requestsFocus(): boolean {
    return !this.topLevelMenu && this.state === MenuState.Open;
  }

  protected override onFocusLost(_e: FocusLostEvent): void {
    // Case where a sub-menu was opened the focus will be transferred to that sub-menu while this menu will receive OnFocusLost
    if (this.submenu?.state === MenuState.Open)
      return;

    if (!this.topLevelMenu)
      // At this point we should have lost focus due to clicks outside the menu structure
      this.closeAll();
  }

  /** Closes all open Menus. */
  private closeAll(): void {
    this.close();
    this.parentMenu?.closeFromChild(this.triggeringItem!.item);
  }

  private closeFromChild(source: MenuItem): void {
    if (this.isHovered || (this.parentMenu?.isHovered ?? false)) return;

    if (this.triggeringItem !== null ? this.triggeringItem.item.items.includes(source) : true) {
      this.close();
      this.parentMenu?.closeFromChild(this.triggeringItem!.item);
    }
  }

  // #endregion

  /** Creates a sub-menu for MenuItem.items of MenuItems added to this Menu. */
  protected abstract createSubMenu(): Menu;

  /** Creates the visual representation for a MenuItem. */
  protected abstract createDrawableMenuItem(item: MenuItem): DrawableMenuItem;

  /** Creates the ScrollContainer to hold the items of this Menu. */
  protected abstract createScrollContainer(direction: Direction): ScrollContainer<Drawable>;

  /** (internal) */
  protected createItemsFlow(direction: FillDirection): FillFlowContainer<DrawableMenuItem> & IItemsFlow {
    return new ItemsFlow().with({ direction });
  }
}

/** (Menu.DrawableMenuItem) */
export abstract class DrawableMenuItem extends CompositeDrawable {
  /** Invoked when this DrawableMenuItem changes its MenuItemState. */
  readonly stateChanged = new Signal<MenuItemState>();

  /** (internal) Invoked when this DrawableMenuItem is clicked. This occurs regardless of whether or not item.action was invoked or not, or whether item contains any sub-MenuItems. */
  clicked: ((item: DrawableMenuItem) => void) | null = null;

  /** (internal) Invoked when this DrawableMenuItem is hovered. This runs one update frame behind the actual hover event. */
  hovered: ((item: DrawableMenuItem) => void) | null = null;

  /** The MenuItem which this DrawableMenuItem represents. */
  readonly item: MenuItem;

  /** The content of this DrawableMenuItem, created through createContent. */
  protected readonly content: Drawable;

  /** The background of this DrawableMenuItem. */
  protected readonly background: Drawable;

  /** The foreground of this DrawableMenuItem. This contains the content of this DrawableMenuItem. */
  protected readonly foreground: Container;

  /** Whether to close all menus when this action DrawableMenuItem is clicked. */
  get closeMenuOnClick(): boolean {
    return true;
  }

  /** (IFilterable.FilterTerms) */
  get filterTerms(): Iterable<string> {
    return [this.item.text.value];
  }

  protected constructor(item: MenuItem) {
    super();

    this.item = item;

    // Edge case where action might be changed while item is already hovered.
    this.item.action.bindDisabledChanged(() => {
      this.scheduler.addOnce(this.updateBackgroundColourCallback);
      this.scheduler.addOnce(this.updateForegroundColourCallback);
    });

    this.item.action.bindValueChanged(() => {
      this.scheduler.addOnce(this.updateBackgroundColourCallback);
      this.scheduler.addOnce(this.updateForegroundColourCallback);
    });

    let background!: Drawable;
    let foreground!: Container;
    let content!: Drawable;

    this.internalChildren = [
      background = this.createBackground(),
      foreground = new Container().with({
        autoSizeAxes: Axes.Both,
        child: content = this.createContent(),
      }),
    ];

    this.background = background;
    this.foreground = foreground;
    this.content = content;

    if (hasText(content)) {
      content.text = item.text.value;
      this.item.text.valueChanged.add(e => content.text = e.newValue);
    }
  }

  /** Sets various properties of this DrawableMenuItem that depend on the direction in which DrawableMenuItems flow inside the containing Menu. */
  setFlowDirection(direction: Direction): void {
    this.relativeSizeAxes = direction === Direction.Horizontal ? Axes.Y : Axes.X;
    this.autoSizeAxes = direction === Direction.Horizontal ? Axes.X : Axes.Y;
  }

  private _backgroundColour = Colour4.fromBytes(47, 79, 79, 255); // (Color4.DarkSlateGray)

  /** Gets or sets the default background colour. */
  get backgroundColour(): Colour4 {
    return this._backgroundColour;
  }

  set backgroundColour(value: Colour4) {
    this._backgroundColour = value;
    this.scheduler.addOnce(this.updateBackgroundColourCallback);
  }

  private _foregroundColour = Colour4.White;

  /** Gets or sets the default foreground colour. */
  get foregroundColour(): Colour4 {
    return this._foregroundColour;
  }

  set foregroundColour(value: Colour4) {
    this._foregroundColour = value;
    this.scheduler.addOnce(this.updateForegroundColourCallback);
  }

  private _backgroundColourHover = Colour4.fromBytes(169, 169, 169, 255); // (Color4.DarkGray)

  /** Gets or sets the background colour when this DrawableMenuItem is hovered. */
  get backgroundColourHover(): Colour4 {
    return this._backgroundColourHover;
  }

  set backgroundColourHover(value: Colour4) {
    this._backgroundColourHover = value;
    this.scheduler.addOnce(this.updateBackgroundColourCallback);
  }

  private _foregroundColourHover = Colour4.White;

  /** Gets or sets the foreground colour when this DrawableMenuItem is hovered. */
  get foregroundColourHover(): Colour4 {
    return this._foregroundColourHover;
  }

  set foregroundColourHover(value: Colour4) {
    this._foregroundColourHover = value;
    this.scheduler.addOnce(this.updateForegroundColourCallback);
  }

  private _state = MenuItemState.NotSelected;

  get state(): MenuItemState {
    return this._state;
  }

  set state(value: MenuItemState) {
    this._state = value;

    this.scheduler.addOnce(this.updateBackgroundColourCallback);
    this.scheduler.addOnce(this.updateForegroundColourCallback);

    this.stateChanged.emit(this._state);
  }

  /** The draw width of the text of this DrawableMenuItem. */
  get contentDrawWidth(): number {
    return this.content.drawWidth;
  }

  /** The draw width of the text of this DrawableMenuItem. */
  get contentDrawHeight(): number {
    return this.content.drawHeight;
  }

  /** Whether this DrawableMenuItem can be actioned (has an item.action that isn't disabled, or a sub-menu). */
  protected get isActionable(): boolean {
    return this.hasSubmenu || (!this.item.action.disabled && this.item.action.value !== null);
  }

  private get hasSubmenu(): boolean {
    return this.item.items.length > 0;
  }

  // (stable delegates for Scheduler.AddOnce, dispatching to the overridable methods)
  private readonly updateBackgroundColourCallback = (): void => this.updateBackgroundColour();
  private readonly updateForegroundColourCallback = (): void => this.updateForegroundColour();

  /** Called after the backgroundColour is modified or the hover state changes. */
  protected updateBackgroundColour(): void {
    this.background.fadeColour(this.isHovered && this.isActionable ? this.backgroundColourHover : this.backgroundColour);
  }

  /** Called after the foregroundColour is modified or the hover state changes. */
  protected updateForegroundColour(): void {
    this.foreground.fadeColour(this.isHovered && this.isActionable ? this.foregroundColourHover : this.foregroundColour);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.scheduler.addOnce(this.updateBackgroundColourCallback);
    this.scheduler.addOnce(this.updateForegroundColourCallback);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.scheduler.addOnce(this.updateBackgroundColourCallback);
    this.scheduler.addOnce(this.updateForegroundColourCallback);

    this.schedule(() => {
      if (this.isHovered)
        this.hovered?.(this);
    });

    return false;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.scheduler.addOnce(this.updateBackgroundColourCallback);
    this.scheduler.addOnce(this.updateForegroundColourCallback);
    super.onHoverLost(e);
  }

  protected override onClick(_e: ClickEvent): boolean {
    if (this.hasSubmenu) {
      this.clicked?.(this);
      return true;
    }

    if (!this.isActionable)
      return true;

    this.item.action.value?.();
    this.clicked?.(this);
    return true;
  }

  /** Creates the background of this DrawableMenuItem. */
  protected createBackground(): Drawable {
    return new Box().with({ relativeSizeAxes: Axes.Both });
  }

  /** Creates the content which will be displayed in this DrawableMenuItem. If the Drawable returned has a text property, it will be automatically updated with item.text. */
  protected abstract createContent(): Drawable;
}
