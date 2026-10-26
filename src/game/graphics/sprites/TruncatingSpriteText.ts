// Ported from osu.Game/Graphics/Sprites/TruncatingSpriteText.cs
// Tooltips aren't ported yet, so the non-truncated text isn't shown on hover.

import { OsuSpriteText } from './OsuSpriteText';

/** A derived version of OsuSpriteText which automatically shows non-truncated text in tooltip when required. */
export class TruncatingSpriteText extends OsuSpriteText {
  constructor() {
    super();

    this.truncate = true;
  }
}
