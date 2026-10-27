// Ported from osu.Game/Graphics/UserInterface/OsuDropdown.cs
// C# overloads OnPressed for PlatformAction and GlobalAction; onPressed dispatches on the action type here.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import type { ScrollContainer } from '@fw/graphics/containers/ScrollContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { DrawableDropdownMenuItem, Dropdown, DropdownMenu } from '@fw/graphics/userInterface/Dropdown';
import { DropdownHeader } from '@fw/graphics/userInterface/DropdownHeader';
import { DropdownSearchBar } from '@fw/graphics/userInterface/DropdownSearchBar';
import { MenuState, type Menu } from '@fw/graphics/userInterface/Menu';
import type { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import type { TextBox } from '@fw/graphics/userInterface/TextBox';
import type { KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { FocusEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { PlatformAction } from '@fw/input/PlatformAction';
import { Anchor, Axes, Direction } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuScrollContainer } from '../containers/OsuScrollContainer';
import { OsuColour } from '../OsuColour';
import { OsuFont } from '../OsuFont';
import { TruncatingSpriteText } from '../sprites/TruncatingSpriteText';
import { HoverClickSounds } from './HoverClickSounds';
import { HoverSounds } from './HoverSounds';
import { OsuMenu } from './OsuMenu';
import { OsuTextBox } from './OsuTextBox';

const corner_radius = 5;

export class OsuDropdown<T> extends Dropdown<T> {
  readonly keyBindingActionTypes: readonly object[] = [GlobalAction];

  protected override createHeader(): DropdownHeader {
    return new OsuDropdownHeader<T>();
  }

  protected override createMenu(): DropdownMenu<T> {
    return new OsuDropdownMenu<T>();
  }

  constructor() {
    super();

    if (this.header instanceof OsuDropdownHeader)
      this.header.dropdown = this;
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.repeat) return false;

    if (e.action === GlobalAction.Back)
      return this.back();

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }
}

/** (OsuDropdown<T>.OsuDropdownMenu) */
export class OsuDropdownMenu<T> extends DropdownMenu<T> {
  override readonly keyBindingActionTypes: readonly object[] = [PlatformAction, GlobalAction];

  override get handleNonPositionalInput(): boolean {
    return this.state === MenuState.Open;
  }

  private sampleOpen: Sample | null = null;
  private sampleClose: Sample | null = null;

  // todo: this uses the same styling as OsuMenu. hopefully we can just use OsuMenu in the future with some refactoring
  constructor() {
    super();

    this.cornerRadius = corner_radius;

    this.maskingContainer.cornerRadius = corner_radius;
    this.alpha = 0;

    // todo: this uses the same styling as OsuMenu. hopefully we can just use OsuMenu in the future with some refactoring
    this.itemsContainer.padding = new MarginPadding(5);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.get(OverlayColourProvider);
    const colours = dependencies.resolve(OsuColour);
    const audio = dependencies.resolve(AudioManager);

    this.backgroundColour = colourProvider?.background5 ?? Colour4.Black;
    this.hoverColour = colourProvider?.light4 ?? colours.pinkDarker;
    this.selectionColour = colourProvider?.background3 ?? colours.pinkDarker.opacity(0.5);

    void audio.samples.get('UI/dropdown-open').then(s => this.sampleOpen = s);
    void audio.samples.get('UI/dropdown-close').then(s => this.sampleClose = s);

    return r;
  }

  // todo: this shouldn't be required after https://github.com/ppy/osu-framework/issues/4519 is fixed.
  private wasOpened = false;

  // todo: this uses the same styling as OsuMenu. hopefully we can just use OsuMenu in the future with some refactoring
  protected override animateOpen(): void {
    this.wasOpened = true;
    this.fadeIn(300, Easing.OutQuint);
    this.sampleOpen?.play();
  }

  protected override animateClose(): void {
    if (this.wasOpened) {
      this.fadeOut(300, Easing.OutQuint);
      this.sampleClose?.play();
    }
  }

  private targetSize: Vector2 | null = null;

  // todo: this uses the same styling as OsuMenu. hopefully we can just use OsuMenu in the future with some refactoring
  protected override updateSize(newSize: Vector2): void {
    // TODO: should probably fix this at a framework level (this method is running every frame which can spam transforms)
    if (this.targetSize !== null && newSize.equals(this.targetSize))
      return;

    this.targetSize = newSize;

    if (this.direction === Direction.Vertical) {
      this.width = newSize.x;
      this.resizeHeightTo(newSize.y, 300, Easing.OutQuint);
    } else {
      this.height = newSize.y;
      this.resizeWidthTo(newSize.x, 300, Easing.OutQuint);
    }
  }

  private _hoverColour = Colour4.Black;

  get hoverColour(): Colour4 {
    return this._hoverColour;
  }

  set hoverColour(value: Colour4) {
    this._hoverColour = value;
    for (const c of this.menuChildren) {
      if (c instanceof DrawableOsuDropdownMenuItem)
        c.backgroundColourHover = value;
    }
  }

  private _selectionColour = Colour4.Black;

  get selectionColour(): Colour4 {
    return this._selectionColour;
  }

  set selectionColour(value: Colour4) {
    this._selectionColour = value;
    for (const c of this.menuChildren) {
      if (c instanceof DrawableOsuDropdownMenuItem)
        c.backgroundColourSelected = value;
    }
  }

  protected override createSubMenu(): Menu {
    return new OsuMenu(Direction.Vertical);
  }

  protected override createDrawableDropdownMenuItem(item: MenuItem): DrawableDropdownMenuItem<T> {
    return new DrawableOsuDropdownMenuItem<T>(item).with({
      backgroundColourHover: this.hoverColour,
      backgroundColourSelected: this.selectionColour,
    });
  }

  protected override createScrollContainer(direction: Direction): ScrollContainer<Drawable> {
    return new OsuScrollContainer(direction);
  }

  override onPressed(e: KeyBindingPressEvent<PlatformAction | GlobalAction>): boolean {
    if (e.actionType !== GlobalAction)
      return super.onPressed(e as KeyBindingPressEvent<PlatformAction>);

    // logic copied from https://github.com/ppy/osu-framework/blob/baf865f1fd9e677310e7e432a7c6af99db7db914/osu.Framework/Graphics/UserInterface/Dropdown.cs#L702-L717
    const visibleMenuItemsList = this.visibleMenuItems;

    if (visibleMenuItemsList.length > 0) {
      const currentPreselected = this.preselectedItem;
      const targetPreselectionIndex = currentPreselected === null ? -1 : visibleMenuItemsList.indexOf(currentPreselected);

      switch (e.action as GlobalAction) {
        case GlobalAction.SelectPrevious:
          this.preselectItemAt(targetPreselectionIndex - 1);
          return true;

        case GlobalAction.SelectNext:
          this.preselectItemAt(targetPreselectionIndex + 1);
          return true;
      }
    }

    return false;
  }

  override onReleased(e: KeyBindingReleaseEvent<PlatformAction | GlobalAction>): void {
    if (e.actionType !== GlobalAction)
      super.onReleased(e as KeyBindingReleaseEvent<PlatformAction>);
  }
}

const chevron_offset = -3;

/** (DrawableOsuDropdownMenuItem.Content) */
export class DrawableOsuDropdownMenuItemContent extends CompositeDrawable {
  get text(): string {
    return this.label.text;
  }

  set text(value: string) {
    this.label.text = value;
  }

  readonly label: TruncatingSpriteText;
  readonly chevron: SpriteIcon;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    this.internalChildren = [
      this.chevron = new SpriteIcon().with({
        icon: FontAwesome.Solid.ChevronRight,
        size: new Vector2(8),
        alpha: 0,
        x: chevron_offset,
        y: 1,
        margin: MarginPadding.of({ left: 3, right: 3 }),
        origin: Anchor.CentreLeft,
        anchor: Anchor.CentreLeft,
      }),
      this.label = new TruncatingSpriteText().with({
        padding: MarginPadding.of({ left: 15 }),
        origin: Anchor.CentreLeft,
        anchor: Anchor.CentreLeft,
        relativeSizeAxes: Axes.X,
      }),
    ];
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.chevron.colour = dependencies.get(OverlayColourProvider)?.background5 ?? Colour4.Black;
    return r;
  }

  private _hovering = false;

  get hovering(): boolean {
    return this._hovering;
  }

  set hovering(value: boolean) {
    if (value === this._hovering)
      return;

    this._hovering = value;

    if (this._hovering) {
      this.chevron.fadeIn(400, Easing.OutQuint);
      this.chevron.moveToX(0, 400, Easing.OutQuint);
    } else {
      this.chevron.fadeOut(200);
      this.chevron.moveToX(chevron_offset, 200, Easing.In);
    }
  }
}

/** (OsuDropdownMenu.DrawableOsuDropdownMenuItem) */
export class DrawableOsuDropdownMenuItem<T> extends DrawableDropdownMenuItem<T> {
  // IsHovered is used
  override get handlePositionalInput(): boolean {
    return true;
  }

  override get backgroundColourHover(): Colour4 {
    return super.backgroundColourHover;
  }

  override set backgroundColourHover(value: Colour4) {
    super.backgroundColourHover = value;
    this.updateColours();
  }

  override get backgroundColourSelected(): Colour4 {
    return super.backgroundColourSelected;
  }

  override set backgroundColourSelected(value: Colour4) {
    super.backgroundColourSelected = value;
    this.updateColours();
  }

  private updateColours(): void {
    this.backgroundColour = this.backgroundColourHover.opacity(0);

    this.updateBackgroundColour();
    this.updateForegroundColour();
  }

  constructor(item: MenuItem) {
    super(item);

    this.foreground.padding = new MarginPadding(2);
    this.foreground.autoSizeAxes = Axes.Y;
    this.foreground.relativeSizeAxes = Axes.X;

    this.masking = true;
    this.cornerRadius = corner_radius;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.addInternal(new HoverSounds());
    return r;
  }

  protected override updateBackgroundColour(): void {
    this.background.fadeColour(this.isPreSelected ? this.backgroundColourHover : this.backgroundColourSelected, 100, Easing.OutQuint);

    if (this.isPreSelected || this.isSelected)
      this.background.fadeIn(100, Easing.OutQuint);
    else
      this.background.fadeOut(600, Easing.OutQuint);
  }

  protected override updateForegroundColour(): void {
    super.updateForegroundColour();

    const content = this.foreground.children[0];
    if (content instanceof DrawableOsuDropdownMenuItemContent)
      content.hovering = this.isHovered;
  }

  protected override createContent(): Drawable {
    return new DrawableOsuDropdownMenuItemContent();
  }
}

/** (OsuDropdown<T>.OsuDropdownHeader) */
export class OsuDropdownHeader<T> extends DropdownHeader {
  protected readonly text: SpriteText;

  override get label(): string {
    return this.text.text;
  }

  override set label(value: string) {
    this.text.text = value;
  }

  protected readonly chevron: SpriteIcon;

  dropdown: OsuDropdown<T> | null = null;

  private colourProvider: OverlayColourProvider | null = null;
  private colours!: OsuColour;

  constructor() {
    super();

    this.foreground.padding = new MarginPadding(10);

    this.autoSizeAxes = Axes.None;
    this.margin = MarginPadding.of({ bottom: 4 });
    this.cornerRadius = corner_radius;
    this.height = 40;

    let text!: SpriteText;
    let chevron!: SpriteIcon;

    this.foreground.child = new GridContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
      columnDimensions: [
        new Dimension(),
        new Dimension(GridSizeMode.AutoSize),
      ],
      content: [
        [
          text = new TruncatingSpriteText().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            relativeSizeAxes: Axes.X,
          }),
          chevron = new SpriteIcon().with({
            icon: FontAwesome.Solid.ChevronDown,
            anchor: Anchor.CentreRight,
            origin: Anchor.CentreRight,
            size: new Vector2(10),
            margin: MarginPadding.of({ right: 2 }),
          }),
        ],
      ],
    });

    this.text = text;
    this.chevron = chevron;

    this.addInternal(new HoverClickSounds());
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colourProvider = dependencies.get(OverlayColourProvider);
    this.colours = dependencies.resolve(OsuColour);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    if (this.dropdown !== null)
      this.dropdown.menu.stateChanged.add(() => this.updateChevron());

    this.searchBar.state.valueChanged.add(() => this.updateColour());
    this.enabled.bindValueChanged(() => this.updateColour());
    this.updateColour();
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.updateColour();
    return false;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.updateColour();
  }

  private updateColour(): void {
    const hovered = this.enabled.value && this.isHovered;
    const hoveredColour = this.colourProvider?.light4 ?? this.colours.pinkDarker;
    const unhoveredColour = this.colourProvider?.background5 ?? Colour4.Black;

    this.colour = Colour4.White;
    this.alpha = this.enabled.value ? 1 : 0.3;

    if (this.searchBar.state.value === Visibility.Visible) {
      this.chevron.colour = hovered ? hoveredColour.lighten(0.5) : Colour4.White;
      this.background.colour = unhoveredColour;
    } else {
      this.chevron.colour = Colour4.White;
      this.background.colour = hovered ? hoveredColour : unhoveredColour;
    }
  }

  private updateChevron(): void {
    const open = this.dropdown!.menu.state === MenuState.Open;
    this.chevron.scaleTo(open ? new Vector2(1, -1) : Vector2.One, 300, Easing.OutQuint);
  }

  protected override createSearchBar(): DropdownSearchBar {
    return new OsuDropdownSearchBar().with({
      padding: MarginPadding.of({ right: 26 }),
    });
  }
}

class OsuDropdownSearchBar extends DropdownSearchBar {
  protected override popIn(): void {
    this.fadeIn();
  }

  protected override popOut(): void {
    this.fadeOut();
  }

  protected override createTextBox(): TextBox {
    return new OsuDropdownSearchTextBox().with({
      fontSize: OsuFont.Default.size,
    });
  }
}

class OsuDropdownSearchTextBox extends OsuTextBox {
  constructor() {
    super();
    this.placeholderText = 'type to search';
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.get(OverlayColourProvider);
    this.backgroundUnfocused = colourProvider?.background5 ?? Colour4.fromBytes(10, 10, 10, 255);
    this.backgroundFocused = colourProvider?.background5 ?? Colour4.fromBytes(10, 10, 10, 255);

    return r;
  }

  protected override onFocus(e: FocusEvent): void {
    super.onFocus(e);
    this.borderThickness = 0;
  }
}
