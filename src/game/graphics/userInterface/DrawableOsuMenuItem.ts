// Ported from osu.Game/Graphics/UserInterface/DrawableOsuMenuItem.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { DrawableMenuItem } from '@fw/graphics/userInterface/Menu';
import type { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../OsuColour';
import { FontWeight, OsuFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { HotkeyDisplay } from './HotkeyDisplay';
import { HoverClickSounds } from './HoverClickSounds';
import { MenuItemType } from './MenuItemType';
import { OsuMenuItem } from './OsuMenuItem';

export class DrawableOsuMenuItem extends DrawableMenuItem {
  static readonly MARGIN_HORIZONTAL = 10;
  static readonly MARGIN_VERTICAL = 4;
  static readonly TEXT_SIZE = 17;
  static readonly TRANSITION_LENGTH = 80;

  readonly showCheckbox = new BindableBool();

  /** (C#'s `text`, assigned by CreateContent() during the base constructor) */
  private get text(): TextContainer {
    return this.content as TextContainer;
  }

  private hotkey!: HotkeyDisplay;
  private hoverClickSounds!: HoverClickSounds;

  private colours!: OsuColour;

  constructor(item: MenuItem) {
    super(item);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);

    this.backgroundColour = Colour4.Transparent;
    this.backgroundColourHover = Colour4.fromHex('172023');

    this.addInternal(this.hotkey = new HotkeyDisplay().with({
      alpha: 0,
      anchor: Anchor.CentreRight,
      origin: Anchor.CentreRight,
      margin: MarginPadding.of({ right: 10, top: 1 }),
    }));
    this.addInternal(this.hoverClickSounds = new HoverClickSounds());

    this.updateText();

    if (this.showChevron) {
      this.addInternal(new SpriteIcon().with({
        margin: MarginPadding.of({ horizontal: 10 }),
        size: new Vector2(8),
        icon: FontAwesome.Solid.ChevronRight,
        anchor: Anchor.CentreRight,
        origin: Anchor.CentreRight,
      }));
    }

    return r;
  }

  // Only add right chevron if direction of menu items is vertical (i.e. width is relative size, see `DrawableMenuItem.SetFlowDirection()`).
  private get showChevron(): boolean {
    return this.item.items.length > 0 && this.relativeSizeAxes === Axes.X;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.showCheckbox.bindValueChanged(() => this.updateState());
    this.item.action.bindDisabledChanged(() => this.updateState(), true);
    this.finishTransforms();
  }

  private updateText(): void {
    const osuMenuItem = this.item instanceof OsuMenuItem ? this.item : null;

    switch (osuMenuItem?.type) {
      default:
      case MenuItemType.Standard:
        this.text.colour = Colour4.White;
        break;

      case MenuItemType.Destructive:
        this.text.colour = this.colours.red1;
        break;

      case MenuItemType.Highlighted:
        this.text.colour = Colour4.fromHex('ffcc22');
        break;
    }

    this.hotkey.hotkey = osuMenuItem?.hotkey ?? null;
    this.hotkey.alpha = this.hotkey.hotkey === null ? 0 : 1;
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // this hack ensures that the menu can auto-size while leaving enough space for the hotkey display.
    // the gist of it is that while the hotkey display is not in the text / "content" that determines sizing
    // (because it cannot be, because we want the hotkey display to align to the *right* and not the left),
    // enough padding to fit the hotkey with _its_ spacing is added as padding of the text to compensate.
    this.text.padding = MarginPadding.of({ right: this.hotkey.alpha > 0 || this.showChevron ? this.hotkey.drawWidth + 15 : 0 });
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
    this.hoverClickSounds.enabled.value = this.isActionable;
    this.alpha = this.isActionable ? 1 : Math.fround(0.2);

    if (this.isHovered && this.isActionable) {
      this.text.boldText.fadeIn(DrawableOsuMenuItem.TRANSITION_LENGTH, Easing.OutQuint);
      this.text.normalText.fadeOut(DrawableOsuMenuItem.TRANSITION_LENGTH, Easing.OutQuint);
    } else {
      this.text.boldText.fadeOut(DrawableOsuMenuItem.TRANSITION_LENGTH, Easing.OutQuint);
      this.text.normalText.fadeIn(DrawableOsuMenuItem.TRANSITION_LENGTH, Easing.OutQuint);
    }

    this.text.checkboxContainer.alpha = this.showCheckbox.value ? 1 : 0;
  }

  protected override createContent(): Drawable {
    return this.createTextContainer();
  }

  protected createTextContainer(): TextContainer {
    return new TextContainer();
  }
}

/** (DrawableOsuMenuItem.TextContainer) */
export class TextContainer extends Container {
  get text(): string {
    return this.normalText.text;
  }

  set text(value: string) {
    this.normalText.text = value;
    this.boldText.text = value;
  }

  readonly normalText: SpriteText;
  readonly boldText: SpriteText;
  readonly checkboxContainer: Container;

  constructor() {
    super();

    this.autoSizeAxes = Axes.Both;

    let normalText!: SpriteText, boldText!: SpriteText, checkboxContainer!: Container;

    this.child = new FillFlowContainer().with({
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,

      autoSizeAxes: Axes.Both,
      spacing: new Vector2(10),
      direction: FillDirection.Horizontal,
      padding: MarginPadding.of({ horizontal: DrawableOsuMenuItem.MARGIN_HORIZONTAL, vertical: DrawableOsuMenuItem.MARGIN_VERTICAL }),

      children: [
        checkboxContainer = new Container().with({
          relativeSizeAxes: Axes.Y,
          width: DrawableOsuMenuItem.MARGIN_HORIZONTAL,
        }),
        new Container().with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          autoSizeAxes: Axes.Both,
          children: [
            normalText = new OsuSpriteText().with({
              alwaysPresent: true, // ensures that the menu item does not change width when switching between normal and bold text.
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
              font: OsuFont.getFont({ size: DrawableOsuMenuItem.TEXT_SIZE }),
            }),
            boldText = new OsuSpriteText().with({
              alwaysPresent: true, // ensures that the menu item does not change width when switching between normal and bold text.
              alpha: 0,
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
              font: OsuFont.getFont({ size: DrawableOsuMenuItem.TEXT_SIZE, weight: FontWeight.Bold }),
            }),
          ],
        }),
      ],
    });

    this.normalText = normalText;
    this.boldText = boldText;
    this.checkboxContainer = checkboxContainer;
  }
}
