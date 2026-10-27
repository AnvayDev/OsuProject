// Ported from osu.Game/Graphics/Sprites/OsuSpriteText.cs

import { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { OsuFont } from '../OsuFont';

export class OsuSpriteText extends SpriteText {
  constructor() {
    super();

    this.shadow = true;
    this.font = OsuFont.Default;
  }
}
