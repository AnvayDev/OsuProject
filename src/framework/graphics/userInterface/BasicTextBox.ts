// Ported from osu.Framework/Graphics/UserInterface/BasicTextBox.cs
// FrameworkFont.Condensed (Roboto Condensed) isn't bundled; its FontUsage falls back to the default font. osu!'s text boxes override both
// places it is used.

import type { FocusEvent, FocusLostEvent } from '../../input/events/UIEvents';
import { Anchor, Axes } from '../../layout/Enums';
import { Vector2 } from '../../layout/Vector2';
import { FontUsage } from '../../text/FontUsage';
import { Easing } from '../../transforms/Easing';
import { Colour4 } from '../Colour4';
import { Container } from '../containers/Container';
import type { Drawable } from '../Drawable';
import { FrameworkColour } from '../FrameworkColour';
import { Box } from '../shapes/Box';
import { SpriteText } from '../sprites/SpriteText';
import { Caret } from './Caret';
import { TextBox } from './TextBox';

const caret_move_time = 60;

/** (FrameworkFont.Condensed) */
const condensedFont = () => new FontUsage('RobotoCondensed', 20, 'Regular');

export class BasicTextBox extends TextBox {
  protected get caretWidth(): number {
    return 2;
  }

  protected get selectionColour(): Colour4 {
    return FrameworkColour.YellowGreen;
  }

  protected backgroundCommit = FrameworkColour.Green;

  private _backgroundFocused = Colour4.fromBytes(100, 100, 100, 255);
  private _backgroundUnfocused = Colour4.fromBytes(100, 100, 100, 120);

  private readonly background: Box;

  protected get backgroundFocused(): Colour4 {
    return this._backgroundFocused;
  }

  protected set backgroundFocused(value: Colour4) {
    this._backgroundFocused = value;
    if (this.hasFocus)
      this.background.colour = value;
  }

  protected get backgroundUnfocused(): Colour4 {
    return this._backgroundUnfocused;
  }

  protected set backgroundUnfocused(value: Colour4) {
    this._backgroundUnfocused = value;
    if (!this.hasFocus)
      this.background.colour = value;
  }

  protected get inputErrorColour(): Colour4 {
    return Colour4.Red;
  }

  constructor() {
    super();

    let background!: Box;

    this.add(background = new Box().with({
      relativeSizeAxes: Axes.Both,
      depth: 1,
      colour: this._backgroundUnfocused,
    }));

    this.background = background;

    this.backgroundFocused = FrameworkColour.BlueGreen;
    this.backgroundUnfocused = FrameworkColour.BlueGreenDark;
    this.textContainer.height = 0.75;
  }

  protected override notifyInputError(): void {
    this.background.flashColour(this.inputErrorColour, 200);
  }

  protected override onTextCommitted(textChanged: boolean): void {
    super.onTextCommitted(textChanged);

    this.background.colour = this.releaseFocusOnCommit ? this.backgroundUnfocused : this.backgroundFocused;
    this.background.clearTransforms();
    this.background.flashColour(this.backgroundCommit, 400);
  }

  protected override onFocusLost(e: FocusLostEvent): void {
    super.onFocusLost(e);

    this.background.clearTransforms();
    this.background.colour = this.backgroundFocused;
    this.background.fadeColour(this.backgroundUnfocused, 200, Easing.OutExpo);
  }

  protected override onFocus(e: FocusEvent): void {
    super.onFocus(e);

    this.background.clearTransforms();
    this.background.colour = this.backgroundUnfocused;
    this.background.fadeColour(this.backgroundFocused, 200, Easing.Out);
  }

  protected override getDrawableCharacter(c: string): Drawable {
    return new FallingDownContainer().with({
      autoSizeAxes: Axes.Both,
      child: new SpriteText().with({ text: c, font: condensedFont().with({ size: this.fontSize }) }),
    });
  }

  protected override createPlaceholder(): SpriteText {
    return new FadingPlaceholderText().with({
      colour: FrameworkColour.YellowGreen,
      font: condensedFont(),
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,
      x: this.caretWidth,
    });
  }

  protected override createCaret(): Caret {
    return new BasicCaret().with({
      caretWidth: this.caretWidth,
      selectionColour: this.selectionColour,
    });
  }
}

/** (BasicTextBox.FallingDownContainer) */
export class FallingDownContainer extends Container {
  override show(): void {
    const col = this.colour.averageColour;
    this.fadeColour(col.opacity(0)).fadeColour(col, caret_move_time * 2, Easing.Out);
  }

  override hide(): void {
    this.fadeOut(200);
    this.moveToY(this.drawSize.y, 200, Easing.InQuad);
  }
}

/** (BasicTextBox.FadingPlaceholderText) */
export class FadingPlaceholderText extends SpriteText {
  override show(): void {
    this.fadeIn(200);
  }

  override hide(): void {
    this.fadeOut(200);
  }
}

/** (BasicTextBox.BasicCaret) */
export class BasicCaret extends Caret {
  constructor() {
    super();

    this.colour = Colour4.Transparent;

    this.internalChild = new Container().with({
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,
      relativeSizeAxes: Axes.Both,
      height: 0.9,
      cornerRadius: 1,
      masking: true,
      child: new Box().with({ relativeSizeAxes: Axes.Both }),
    });
  }

  override hide(): void {
    this.fadeOut(200);
  }

  caretWidth = 0;

  selectionColour = Colour4.White;

  displayAt(position: Vector2, selectionWidth: number | null): void {
    if (selectionWidth !== null) {
      this.moveTo(new Vector2(position.x, position.y), 60, Easing.Out);
      this.resizeWidthTo(selectionWidth + this.caretWidth / 2, caret_move_time, Easing.Out);
      this
        .fadeTo(0.5, 200, Easing.Out)
        .fadeColour(this.selectionColour, 200, Easing.Out);
    } else {
      this.moveTo(new Vector2(position.x - this.caretWidth / 2, position.y), 60, Easing.Out);
      this.resizeWidthTo(this.caretWidth, caret_move_time, Easing.Out);
      this
        .fadeColour(Colour4.White, 200, Easing.Out)
        .loop(c => c.fadeTo(0.7).fadeTo(0.4, 500, Easing.InOutSine));
    }
  }
}
