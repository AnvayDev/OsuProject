// Ported from osu.Game/Graphics/UserInterface/ShearedFilterTextBox.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Anchor } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { OsuColour } from '../OsuColour';
import { FontWeight, OsuFont, withFont } from '../OsuFont';
import { OsuSpriteText } from '../sprites/OsuSpriteText';
import { InnerSearchTextBox, ShearedSearchTextBox } from './ShearedSearchTextBox';

const filter_text_size = 12;

export class ShearedFilterTextBox extends ShearedSearchTextBox {
  get statusText(): string {
    return (this.textBox as InnerFilterTextBox).statusText.text;
  }

  set statusText(value: string) {
    this.schedule(() => (this.textBox as InnerFilterTextBox).statusText.text = value);
  }

  constructor() {
    super();

    this.height += filter_text_size;
  }

  protected override createInnerTextBox(): InnerSearchTextBox {
    return new InnerFilterTextBox();
  }
}

/** (ShearedFilterTextBox.InnerFilterTextBox) */
export class InnerFilterTextBox extends InnerSearchTextBox {
  statusText!: OsuSpriteText;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.textContainer.add(this.statusText = new OsuSpriteText().with({
      anchor: Anchor.BottomLeft,
      origin: Anchor.TopLeft,
      font: withFont(OsuFont.Torus, { size: filter_text_size, weight: FontWeight.SemiBold }),
      margin: MarginPadding.of({ top: 2, left: -1 }),
      colour: dependencies.resolve(OsuColour).yellow,
    }));

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.textContainer.height *= (this.drawHeight - filter_text_size) / this.drawHeight;
    this.textContainer.margin = MarginPadding.of({ bottom: filter_text_size });
  }
}
