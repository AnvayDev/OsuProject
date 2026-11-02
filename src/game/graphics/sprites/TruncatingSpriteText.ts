// Ported from osu.Game/Graphics/Sprites/TruncatingSpriteText.cs

import { OsuSpriteText } from './OsuSpriteText';

/** A derived version of OsuSpriteText which automatically shows non-truncated text in tooltip when required. */
export class TruncatingSpriteText extends OsuSpriteText {
  /** Whether a tooltip should be shown with non-truncated text on hover. */
  showTooltip = true;

  get tooltipText(): string {
    return this.text;
  }

  override get handlePositionalInput(): boolean {
    return this.isTruncated && this.showTooltip;
  }

  constructor() {
    super();

    this.truncate = true;
  }
}
