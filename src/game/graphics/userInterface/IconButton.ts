// Ported from osu.Game/Graphics/UserInterface/IconButton.cs

import { Colour4 } from '@fw/graphics/Colour4';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuAnimatedButton } from './OsuAnimatedButton';

export class IconButton extends OsuAnimatedButton {
  static readonly DEFAULT_BUTTON_SIZE = 30;

  private _iconColour: Colour4 | null = null;

  /** The icon colour. This does not affect Drawable.colour. */
  get iconColour(): Colour4 {
    return this._iconColour ?? Colour4.White;
  }

  set iconColour(value: Colour4) {
    this._iconColour = value;
    this.iconSprite.fadeColour(value);
  }

  private _iconHoverColour: Colour4 | null = null;

  /** The icon colour while the IconButton is hovered. */
  get iconHoverColour(): Colour4 {
    return this._iconHoverColour ?? this.iconColour;
  }

  set iconHoverColour(value: Colour4) {
    this._iconHoverColour = value;
  }

  /** The icon. */
  get icon(): IconUsage {
    return this.iconSprite.icon;
  }

  set icon(value: IconUsage) {
    this.iconSprite.icon = value;
  }

  /** The icon scale. This does not affect Drawable.scale. */
  get iconScale(): Vector2 {
    return this.iconSprite.scale;
  }

  set iconScale(value: Vector2) {
    this.iconSprite.scale = value;
  }

  private readonly iconSprite: SpriteIcon;

  constructor() {
    super();

    this.size = new Vector2(IconButton.DEFAULT_BUTTON_SIZE);

    this.add(this.iconSprite = new SpriteIcon().with({
      origin: Anchor.Centre,
      anchor: Anchor.Centre,
      size: new Vector2(18),
    }));
  }

  protected override onHover(e: HoverEvent): boolean {
    this.iconSprite.fadeColour(this.iconHoverColour, 500, Easing.OutQuint);
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.iconSprite.fadeColour(this.iconColour, 500, Easing.OutQuint);
    super.onHoverLost(e);
  }
}
