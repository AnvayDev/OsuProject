// Ported from osu.Game/Graphics/UserInterface/OsuMenu.cs
// StatefulMenuItem (checkbox items) isn't ported yet: no menu shows checkboxes.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import type { ScrollContainer } from '@fw/graphics/containers/ScrollContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { type DrawableMenuItem, Menu } from '@fw/graphics/userInterface/Menu';
import type { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import { Box } from '@fw/graphics/shapes/Box';
import type { ClickEvent, HoverEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, Direction } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuScrollContainer } from '../containers/OsuScrollContainer';
import { DrawableOsuMenuItem } from './DrawableOsuMenuItem';
import { OsuMenuItemSpacer } from './OsuMenuItemSpacer';
import { OsuMenuSamples } from './OsuMenuSamples';

export class OsuMenu extends Menu {
  protected static readonly DELAY_BEFORE_FADE_OUT = 50;
  protected static readonly FADE_DURATION = 280;

  // todo: this shouldn't be required after https://github.com/ppy/osu-framework/issues/4519 is fixed.
  protected wasOpened = false;

  readonly playSamples: boolean;

  private menuSamples: OsuMenuSamples | null = null;

  constructor(direction: Direction, topLevelMenu = false, playSamples = !topLevelMenu) {
    super(direction, topLevelMenu);

    this.playSamples = playSamples;
    this.backgroundColour = Colour4.Black.opacity(0.5);

    this.maskingContainer.cornerRadius = 4;
    this.itemsContainer.padding = new MarginPadding(5);

    this.onSubmenuOpen.add(() => this.menuSamples?.playSubOpenSample());
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.menuSamples = dependencies.get(OsuMenuSamples);
    return r;
  }

  protected override animateOpen(): void {
    if (this.playSamples && !this.wasOpened)
      this.menuSamples?.playOpenSample();

    this.wasOpened = true;
    this.fadeIn(OsuMenu.FADE_DURATION, Easing.OutQuint);
  }

  protected override animateClose(): void {
    if (this.playSamples && this.wasOpened)
      this.menuSamples?.playCloseSample();

    this.delay(OsuMenu.DELAY_BEFORE_FADE_OUT)
      .fadeOut(OsuMenu.FADE_DURATION, Easing.OutQuint);

    this.wasOpened = false;
  }

  protected override updateSize(newSize: Vector2): void {
    if (this.direction === Direction.Vertical) {
      this.width = newSize.x;

      if (newSize.y > 0)
        this.resizeHeightTo(newSize.y, 300, Easing.OutQuint);
      else
        // Delay until the fade out finishes from AnimateClose.
        this.delay(OsuMenu.DELAY_BEFORE_FADE_OUT + OsuMenu.FADE_DURATION).resizeHeightTo(0);
    } else {
      this.height = newSize.y;
      if (newSize.x > 0)
        this.resizeWidthTo(newSize.x, 300, Easing.OutQuint);
      else
        // Delay until the fade out finishes from AnimateClose.
        this.delay(OsuMenu.DELAY_BEFORE_FADE_OUT + OsuMenu.FADE_DURATION).resizeWidthTo(0);
    }
  }

  protected override createDrawableMenuItem(item: MenuItem): DrawableMenuItem {
    if (item instanceof OsuMenuItemSpacer)
      return new DrawableSpacer(item);

    return new DrawableOsuMenuItem(item);
  }

  protected override createScrollContainer(direction: Direction): ScrollContainer<Drawable> {
    return new OsuScrollContainer(direction);
  }

  protected override createSubMenu(): Menu {
    return new OsuMenu(Direction.Vertical).with({
      anchor: this.direction === Direction.Horizontal ? Anchor.BottomLeft : Anchor.TopRight,
    });
  }
}

/** (OsuMenu.DrawableSpacer) */
class DrawableSpacer extends DrawableOsuMenuItem {
  constructor(item: MenuItem) {
    super(item);

    this.scale = new Vector2(1, Math.fround(0.6));

    this.addInternal(new Box().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      colour: this.backgroundColourHover,
      relativeSizeAxes: Axes.X,
      height: 2,
      width: Math.fround(0.9),
    }));
  }

  protected override onHover(_e: HoverEvent): boolean {
    return true;
  }

  protected override onClick(_e: ClickEvent): boolean {
    return true;
  }
}
