// Ported from osu.Game/Graphics/UserInterface/BasicSearchTextBox.cs

import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { SearchTextBox } from './SearchTextBox';

export class BasicSearchTextBox extends SearchTextBox {
  constructor() {
    super();

    this.add(new SpriteIcon().with({
      icon: FontAwesome.Solid.Search,
      origin: Anchor.CentreRight,
      anchor: Anchor.CentreRight,
      margin: MarginPadding.of({ right: 10 }),
      size: new Vector2(20),
    }));

    this.textFlow.padding = MarginPadding.of({ right: 35 });
  }
}
