// Ported from osu.Game/Graphics/UserInterface/OsuMenu.cs
// Only what dropdown submenus use: Menu creates one (empty, and never opened) the first time an item is hovered. Menu items
// (DrawableOsuMenuItem, StatefulMenuItem checkboxes, spacers) and OsuMenuSamples arrive with context menus; until then the samples aren't
// played (an empty submenu never plays them) and createDrawableMenuItem isn't available.

import { Colour4 } from '@fw/graphics/Colour4';
import type { ScrollContainer } from '@fw/graphics/containers/ScrollContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { type DrawableMenuItem, Menu } from '@fw/graphics/userInterface/Menu';
import type { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import { Anchor, Direction } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import type { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuScrollContainer } from '../containers/OsuScrollContainer';

export class OsuMenu extends Menu {
  protected static readonly DELAY_BEFORE_FADE_OUT = 50;
  protected static readonly FADE_DURATION = 280;

  // todo: this shouldn't be required after https://github.com/ppy/osu-framework/issues/4519 is fixed.
  protected wasOpened = false;

  readonly playSamples: boolean;

  constructor(direction: Direction, topLevelMenu = false, playSamples = !topLevelMenu) {
    super(direction, topLevelMenu);

    this.playSamples = playSamples;
    this.backgroundColour = Colour4.Black.opacity(0.5);

    this.maskingContainer.cornerRadius = 4;
    this.itemsContainer.padding = new MarginPadding(5);
  }

  protected override animateOpen(): void {
    this.wasOpened = true;
    this.fadeIn(OsuMenu.FADE_DURATION, Easing.OutQuint);
  }

  protected override animateClose(): void {
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

  protected override createDrawableMenuItem(_item: MenuItem): DrawableMenuItem {
    throw new Error('OsuMenu items (DrawableOsuMenuItem) aren\'t ported yet.');
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
