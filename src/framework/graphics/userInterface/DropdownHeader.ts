// Ported from osu.Framework/Graphics/UserInterface/DropdownHeader.cs

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Bindable } from '../../bindables/Bindable';
import { Signal } from '../../bindables/Signal';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '../../input/bindings/KeyBindings';
import type { ClickEvent, HoverEvent, HoverLostEvent, KeyDownEvent } from '../../input/events/UIEvents';
import { Key } from '../../input/Key';
import { PlatformAction } from '../../input/PlatformAction';
import { Anchor, Axes } from '../../layout/Enums';
import { Colour4 } from '../Colour4';
import { Container } from '../containers/Container';
import { Visibility } from '../containers/VisibilityContainer';
import { Drawable } from '../Drawable';
import { Box } from '../shapes/Box';
import type { DropdownSearchBar } from './DropdownSearchBar';
import { IDropdown } from './IDropdown';

export enum DropdownSelectionAction {
  Previous,
  Next,
  First,
  Last,
  FirstVisible,
  LastVisible,
}

/** (DropdownHeader.ClickHandler) */
class ClickHandler extends Drawable {
  constructor(private readonly click: (e: ClickEvent) => boolean) {
    super();
  }

  protected override onClick(e: ClickEvent): boolean {
    return this.click(e);
  }
}

export abstract class DropdownHeader extends Container implements IKeyBindingHandler<PlatformAction> {
  readonly keyBindingActionTypes: readonly object[] = [PlatformAction];

  readonly changeSelection = new Signal<DropdownSelectionAction>();

  protected background: Container;
  protected foreground: Container;

  get alwaysShowSearchBar(): boolean {
    return this.searchBar.alwaysDisplayOnFocus;
  }

  set alwaysShowSearchBar(value: boolean) {
    this.searchBar.alwaysDisplayOnFocus = value;
  }

  /** (protected internal) */
  readonly searchBar: DropdownSearchBar;

  get searchTerm(): Bindable<string> {
    return this.searchBar.searchTerm;
  }

  private _backgroundColour = Colour4.fromBytes(169, 169, 169, 255); // (Color4.DarkGray)

  protected get backgroundColour(): Colour4 {
    return this._backgroundColour;
  }

  protected set backgroundColour(value: Colour4) {
    this._backgroundColour = value;
    this.updateState();
  }

  private _disabledColour = Colour4.Gray;

  protected get disabledColour(): Colour4 {
    return this._disabledColour;
  }

  protected set disabledColour(value: Colour4) {
    this._disabledColour = value;
    this.updateState();
  }

  protected backgroundColourHover = Colour4.Gray;

  protected override get content(): Container {
    return this.foreground;
  }

  /** (protected internal) */
  abstract get label(): string;
  abstract set label(value: string);

  readonly enabled = new Bindable<boolean>(true);

  private resolvedDropdown!: IDropdown;

  protected constructor() {
    super();

    this.masking = true;
    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
    this.width = 1;

    let background!: Container;
    let foreground!: Container;
    let searchBar!: DropdownSearchBar;

    this.internalChildren = [
      background = new Container().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        relativeSizeAxes: Axes.Both,
        colour: Colour4.fromBytes(169, 169, 169, 255),
        child: new Box().with({
          relativeSizeAxes: Axes.Both,
          colour: Colour4.White,
        }),
      }),
      foreground = new Container().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
      }),
      searchBar = this.createSearchBar(),
      new ClickHandler(e => this.onHeaderClick(e)).with({
        relativeSizeAxes: Axes.Both,
      }),
    ];

    this.background = background;
    this.foreground = foreground;
    this.searchBar = searchBar;
  }

  protected abstract createSearchBar(): DropdownSearchBar;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.resolvedDropdown = dependencies.resolve(IDropdown);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.enabled.bindTo(this.resolvedDropdown.enabled);
    this.enabled.bindValueChanged(() => this.updateState(), true);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateState();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateState();
    super.onHoverLost(e);
  }

  private updateState(): void {
    this.colour = this.enabled.value ? Colour4.White : this.disabledColour;
    this.background.colour = this.isHovered && this.enabled.value ? this.backgroundColourHover : this.backgroundColour;
  }

  private onHeaderClick(_e: ClickEvent): boolean {
    // Allow input to fall through to the search bar (and its contained textbox) if there's any search text.
    if (this.searchBar.state.value === Visibility.Visible && this.searchTerm.value)
      return false;

    // Otherwise, the header acts as a button to show/hide the menu.
    this.resolvedDropdown.toggleMenu();
    return true;
  }

  override get handleNonPositionalInput(): boolean {
    return this.isHovered;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (!this.enabled.value)
      return false;

    switch (e.key) {
      case Key.Up:
        this.changeSelection.emit(DropdownSelectionAction.Previous);
        return true;

      case Key.Down:
        this.changeSelection.emit(DropdownSelectionAction.Next);
        return true;

      default:
        return super.onKeyDown(e);
    }
  }

  onPressed(e: KeyBindingPressEvent<PlatformAction>): boolean {
    if (!this.enabled.value)
      return false;

    switch (e.action) {
      case PlatformAction.MoveToListStart:
        this.changeSelection.emit(DropdownSelectionAction.First);
        return true;

      case PlatformAction.MoveToListEnd:
        this.changeSelection.emit(DropdownSelectionAction.Last);
        return true;

      default:
        return false;
    }
  }

  onReleased(_e: KeyBindingReleaseEvent<PlatformAction>): void {
  }
}
