// Ported from osu.Game/Graphics/Containers/OsuTextFlowContainer.cs

import { Container } from '@fw/graphics/containers/Container';
import { type IHasLineBaseHeight, type ITextPart, TextFlowContainer, TextPartManual } from '@fw/graphics/containers/TextFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { Axes } from '@fw/layout/Enums';
import { OsuSpriteText } from '../sprites/OsuSpriteText';

class ArbitraryDrawableWrapper extends Container implements IHasLineBaseHeight {
  private readonly lineBaseHeightSource: IHasLineBaseHeight | null;

  get lineBaseHeight(): number {
    return this.lineBaseHeightSource?.lineBaseHeight ?? this.drawHeight;
  }

  constructor(drawable: Drawable) {
    super();

    this.child = drawable;
    this.lineBaseHeightSource = typeof (drawable as Partial<IHasLineBaseHeight>).lineBaseHeight === 'number' ? drawable as unknown as IHasLineBaseHeight : null;
    this.autoSizeAxes = Axes.Both;
  }
}

export class OsuTextFlowContainer extends TextFlowContainer {
  override createSpriteText(): SpriteText {
    return new OsuSpriteText();
  }

  addArbitraryDrawable(drawable: Drawable): ITextPart {
    return this.addPart(new TextPartManual([new ArbitraryDrawableWrapper(drawable)]));
  }

  addIcon(icon: IconUsage, creationParameters: ((t: SpriteText) => void) | null = null): ITextPart {
    return this.addText(icon.icon, creationParameters);
  }
}
