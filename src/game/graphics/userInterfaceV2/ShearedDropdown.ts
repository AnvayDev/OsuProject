// Ported from osu.Game/Graphics/UserInterfaceV2/ShearedDropdown.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { type DrawableDropdownMenuItem, Dropdown, type DropdownMenu } from '@fw/graphics/userInterface/Dropdown';
import { DropdownHeader } from '@fw/graphics/userInterface/DropdownHeader';
import { DropdownSearchBar } from '@fw/graphics/userInterface/DropdownSearchBar';
import { MenuState } from '@fw/graphics/userInterface/Menu';
import type { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import type { TextBox } from '@fw/graphics/userInterface/TextBox';
import type { KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { FocusEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OsuColour } from '../OsuColour';
import { FontWeight, OsuFont, withFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { TruncatingSpriteText } from '../sprites/TruncatingSpriteText';
import { HoverClickSounds } from '../userInterface/HoverClickSounds';
import { DrawableOsuDropdownMenuItem, OsuDropdownMenu } from '../userInterface/OsuDropdown';
import { OsuTextBox } from '../userInterface/OsuTextBox';
import { ShearedButton } from '../userInterface/ShearedButton';

export class ShearedDropdown<T> extends Dropdown<T> {
  readonly keyBindingActionTypes: readonly object[] = [GlobalAction];

  protected override createHeader(): DropdownHeader {
    return new ShearedDropdownHeader<T>();
  }

  protected override createMenu(): DropdownMenu<T> {
    return new ShearedDropdownMenu<T>();
  }

  constructor(label: string) {
    super();

    if (this.header instanceof ShearedDropdownHeader) {
      this.header.dropdown = this;
      this.header.leftSideLabel = label;
    }
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

/** (ShearedDropdown<T>.ShearedDropdownMenu) */
export class ShearedDropdownMenu<T> extends OsuDropdownMenu<T> {
  constructor() {
    super();

    this.shear = OsuGame.SHEAR;
    this.margin = MarginPadding.of({ top: 5 });
    this.padding = MarginPadding.of({
      left: -6,
      right: 6,
    });
  }

  protected override createDrawableDropdownMenuItem(item: MenuItem): DrawableDropdownMenuItem<T> {
    return new ShearedMenuItem<T>(item).with({
      backgroundColourHover: this.hoverColour,
      backgroundColourSelected: this.selectionColour,
    });
  }
}

/** (ShearedDropdownMenu.ShearedMenuItem) */
export class ShearedMenuItem<T> extends DrawableOsuDropdownMenuItem<T> {
  constructor(item: MenuItem) {
    super(item);

    this.foreground.shear = OsuGame.SHEAR.neg();
  }
}

/** (ShearedDropdown<T>.ShearedDropdownHeader) */
export class ShearedDropdownHeader<T> extends DropdownHeader {
  private _label = '';

  override get label(): string {
    return this._label;
  }

  override set label(value: string) {
    this._label = value;
    this.valueText.text = value;
  }

  set leftSideLabel(value: string) {
    this.labelText.text = value;
  }

  private readonly labelText: OsuSpriteText;
  private readonly valueText: OsuSpriteText;
  private readonly labelBox: Box;
  private readonly chevron: SpriteIcon;

  readonly labelContainer: Container;

  dropdown!: ShearedDropdown<T>;

  private colourProvider!: OverlayColourProvider;

  constructor() {
    super();

    this.shear = OsuGame.SHEAR;
    this.cornerRadius = ShearedButton.CORNER_RADIUS;
    this.masking = true;

    let labelContainer!: Container;
    let labelBox!: Box;
    let labelText!: OsuSpriteText;
    let valueText!: OsuSpriteText;
    let chevron!: SpriteIcon;

    this.foreground.children = [
      new GridContainer().with({
        relativeSizeAxes: Axes.X,
        autoSizeAxes: Axes.Y,
        rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
        columnDimensions: [
          new Dimension(GridSizeMode.AutoSize),
          new Dimension(),
        ],
        content: [
          [
            labelContainer = new Container().with({
              depth: Number.MAX_VALUE,
              cornerRadius: ShearedButton.CORNER_RADIUS,
              masking: true,
              autoSizeAxes: Axes.Both,
              children: [
                labelBox = new Box().with({
                  relativeSizeAxes: Axes.Both,
                }),
                labelText = new OsuSpriteText().with({
                  margin: MarginPadding.of({
                    horizontal: 10,
                    // Chosen specifically so the height of these dropdowns matches ShearedToggleButton (30).
                    vertical: 7,
                  }),
                  font: withFont(OsuFont.Style.Body, { weight: FontWeight.SemiBold }),
                  shear: OsuGame.SHEAR.neg(),
                }),
              ],
            }),
            new Container().with({
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
              relativeSizeAxes: Axes.X,
              autoSizeAxes: Axes.Y,
              padding: MarginPadding.of({ horizontal: 10 }),
              shear: OsuGame.SHEAR.neg(),
              children: [
                valueText = new TruncatingSpriteText().with({
                  anchor: Anchor.CentreLeft,
                  origin: Anchor.CentreLeft,
                  padding: MarginPadding.of({ right: 15 }),
                  font: OsuFont.Style.Body,
                  relativeSizeAxes: Axes.X,
                }),
                chevron = new SpriteIcon().with({
                  anchor: Anchor.CentreRight,
                  origin: Anchor.CentreRight,
                  y: 1,
                  icon: FontAwesome.Solid.ChevronDown,
                  size: new Vector2(10),
                }),
              ],
            }),
          ],
        ],
      }),
    ];

    this.labelContainer = labelContainer;
    this.labelBox = labelBox;
    this.labelText = labelText;
    this.valueText = valueText;
    this.chevron = chevron;

    this.addInternal(new HoverClickSounds());
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    this.labelBox.colour = this.colourProvider.background3;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.dropdown.menu.stateChanged.add(() => this.updateChevron());
    this.searchBar.state.valueChanged.add(() => this.updateColour());
    this.enabled.bindValueChanged(() => this.updateColour());
    this.updateColour();
  }

  protected override update(): void {
    super.update();
    this.searchBar.padding = MarginPadding.of({ left: this.labelContainer.drawWidth });

    // By limiting the width we avoid this box showing up as an outline around the drawables that are on top of it.
    this.background.padding = MarginPadding.of({ left: this.labelContainer.drawWidth - ShearedButton.CORNER_RADIUS });
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
    const hoveredColour = this.colourProvider.light4;
    const unhoveredColour = this.colourProvider.background5;

    this.colour = this.enabled.value ? Colour4.White : OsuColour.gray(0.6);

    if (this.searchBar.state.value === Visibility.Visible) {
      this.chevron.colour = hovered ? hoveredColour.lighten(0.5) : Colour4.White;
      this.background.colour = unhoveredColour;
    } else {
      this.chevron.colour = Colour4.White;
      this.background.colour = hovered ? hoveredColour : unhoveredColour;
    }
  }

  private updateChevron(): void {
    const open = this.dropdown.menu.state === MenuState.Open;
    this.chevron.scaleTo(open ? new Vector2(1, -1) : Vector2.One, 300, Easing.OutQuint);
  }

  protected override createSearchBar(): DropdownSearchBar {
    return new ShearedDropdownSearchBar();
  }
}

class ShearedDropdownSearchBar extends DropdownSearchBar {
  protected override popIn(): void {
    this.fadeIn();
  }

  protected override popOut(): void {
    this.fadeOut();
  }

  protected override createTextBox(): TextBox {
    return new ShearedDropdownSearchTextBox().with({
      fontSize: OsuFont.Default.size,
    });
  }
}

class ShearedDropdownSearchTextBox extends OsuTextBox {
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.get(OverlayColourProvider);
    this.textContainer.shear = OsuGame.SHEAR.neg();
    this.backgroundUnfocused = colourProvider?.background5 ?? Colour4.fromBytes(10, 10, 10, 255);
    this.backgroundFocused = colourProvider?.background5 ?? Colour4.fromBytes(10, 10, 10, 255);

    return r;
  }

  protected override onFocus(e: FocusEvent): void {
    super.onFocus(e);
    this.borderThickness = 0;
  }
}
