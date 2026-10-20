// Ported from osu.Framework/Text/TextBuilder.cs, TextBuilderGlyph.cs, MultilineTextBuilder.cs and TruncatingTextBuilder.cs.
// Strings are iterated by UTF-16 code unit, like C#'s `foreach (char c in text)`.

import { RectangleF } from '../layout/Primitives';
import { Vector2 } from '../layout/Vector2';
import type { FontUsage } from './FontUsage';
import { isWhiteSpace, type GlyphTexture, type ICharacterGlyph, type ITexturedCharacterGlyph, type ITexturedGlyphLookupStore } from './FontStore';

/** A glyph from a TextBuilder, positioned and scaled to the font size. */
export class TextBuilderGlyph implements ITexturedCharacterGlyph {
  get texture(): GlyphTexture { return this.glyph.texture; }

  get xOffset(): number {
    return (this.fixedWidth !== null ? (this.fixedWidth - this.glyph.width) / 2 : this.glyph.xOffset) * this.textSize;
  }

  get xAdvance(): number {
    return (this.fixedWidth ?? this.glyph.xAdvance) * this.textSize;
  }

  get width(): number {
    return this.glyph.width * this.textSize;
  }

  get character(): string {
    return this.glyph.character;
  }

  get yOffset(): number {
    if (this.useFontSizeAsHeight)
      return this.glyph.yOffset * this.textSize;

    return 0;
  }

  get baseline(): number {
    if (this.useFontSizeAsHeight)
      return this.glyph.baseline * this.textSize;

    return (this.glyph.baseline - this.glyph.yOffset) * this.textSize;
  }

  get height(): number {
    // Space characters typically have heights that exceed the height of all other characters in the font
    // Thus, the height is forced to 0 such that only non-whitespace character heights are considered
    if (isWhiteSpace(this.glyph))
      return 0;

    return this.glyph.height * this.textSize;
  }

  /** The rectangle for the character to be drawn in. */
  drawRectangle = RectangleF.Empty;

  /** Relative position of the line this glyph is on. */
  linePosition = 0;

  /** Whether this is the first character on a new line. */
  onNewLine = false;

  /** @internal */
  constructor(readonly glyph: ITexturedCharacterGlyph, private readonly textSize: number, private readonly fixedWidth: number | null = null,
              private readonly useFontSizeAsHeight = true) {}

  getKerning(lastGlyph: ICharacterGlyph): number {
    return this.fixedWidth !== null ? 0 : this.glyph.getKerning(lastGlyph);
  }

  /** C# struct copy semantics (Characters[i] = previous). */
  clone(): TextBuilderGlyph {
    const g = new TextBuilderGlyph(this.glyph, this.textSize, this.fixedWidth, this.useFontSizeAsHeight);
    g.drawRectangle = this.drawRectangle;
    g.linePosition = this.linePosition;
    g.onNewLine = this.onNewLine;
    return g;
  }
}

const offsetRect = (r: RectangleF, dx: number, dy: number) => new RectangleF(r.x + dx, r.y + dy, r.width, r.height);

/** A text builder for SpriteText and other text-based display components. */
export class TextBuilder {
  /** The bounds of the text (the bottom-right extent of all characters added so far). */
  bounds = Vector2.Zero;

  /** All characters created by this TextBuilder. */
  readonly characters: TextBuilderGlyph[];

  private readonly neverFixedWidthCharacters: string[];
  private readonly fallbackCharacter: string;
  private readonly fixedWidthReferenceCharacter: string;
  private readonly store: ITexturedGlyphLookupStore;
  private readonly font: FontUsage;
  private readonly useFontSizeAsHeight: boolean;
  private readonly startOffset: Vector2;
  private readonly spacing: Vector2;
  private readonly maxWidth: number;

  private currentPosX: number;
  private currentPosY: number;
  private currentLineHeight = 0;
  private currentLineBase: number | null = null;
  private currentNewLine = true;

  /** Gets the current base height of the text in this TextBuilder. Only valid for single lines. */
  get lineBaseHeight(): number {
    if (this.currentPosY > this.startOffset.y)
      throw new Error('Cannot return a LineBaseHeight from a text builder with multiple lines.');

    return this.currentLineBase ?? 0;
  }

  constructor(store: ITexturedGlyphLookupStore, font: FontUsage, maxWidth = Number.MAX_VALUE, useFontSizeAsHeight = true, startOffset = Vector2.Zero,
              spacing = Vector2.Zero, characterList: TextBuilderGlyph[] | null = null, neverFixedWidthCharacters: string[] | null = null,
              fallbackCharacter = '?', fixedWidthReferenceCharacter = 'm') {
    this.store = store;
    this.font = font;
    this.useFontSizeAsHeight = useFontSizeAsHeight;
    this.startOffset = startOffset;
    this.spacing = spacing;
    this.maxWidth = maxWidth;

    this.characters = characterList ?? [];
    this.neverFixedWidthCharacters = neverFixedWidthCharacters ?? [];
    this.fallbackCharacter = fallbackCharacter;
    this.fixedWidthReferenceCharacter = fixedWidthReferenceCharacter;

    this.currentPosX = startOffset.x;
    this.currentPosY = startOffset.y;
  }

  /** Resets this TextBuilder to a default state. */
  reset(): void {
    this.bounds = Vector2.Zero;
    this.characters.length = 0;

    this.currentPosX = this.startOffset.x;
    this.currentPosY = this.startOffset.y;
    this.currentLineBase = null;
    this.currentLineHeight = 0;
    this.currentNewLine = true;
  }

  /** Whether characters can be added to this TextBuilder. */
  protected get canAddCharacters(): boolean {
    return true;
  }

  /** Appends text to this TextBuilder. */
  addText(text: string): void {
    for (let i = 0; i < text.length; i++) {
      if (!this.addCharacter(text[i]))
        break;
    }
  }

  /** Appends a character to this TextBuilder. Returns whether more characters can be added. */
  addCharacter(character: string): boolean {
    if (!this.canAddCharacters)
      return false;

    const glyph = this.tryCreateGlyph(character);
    if (glyph === null)
      return true;

    let kerning = 0;

    // Spacing + kerning are only applied if the current line is not empty
    if (!this.currentNewLine) {
      if (this.characters.length > 0)
        kerning = glyph.getKerning(this.characters[this.characters.length - 1].glyph);
      kerning += this.spacing.x;
    }

    // Check if there is enough space for the character and let subclasses decide whether to continue adding the character if not
    if (!this.hasAvailableSpace(kerning + glyph.xAdvance)) {
      this.onWidthExceeded();

      if (!this.canAddCharacters)
        return false;
    }

    // The kerning is only added after it is guaranteed that the character will be added, to not leave the current position in a bad state
    this.currentPosX += kerning;

    glyph.drawRectangle = new RectangleF(this.currentPosX + glyph.xOffset, this.currentPosY + glyph.yOffset, glyph.width, glyph.height);
    glyph.linePosition = this.currentPosY;
    glyph.onNewLine = this.currentNewLine;

    if (!isWhiteSpace(glyph)) {
      if (this.currentLineBase !== null && glyph.baseline > this.currentLineBase) {
        for (let i = this.characters.length - 1; i >= 0; --i) {
          const previous = this.characters[i].clone();
          previous.drawRectangle = offsetRect(previous.drawRectangle, 0, glyph.baseline - this.currentLineBase);
          this.characters[i] = previous;

          this.currentLineHeight = Math.max(this.currentLineHeight, previous.drawRectangle.bottom - previous.linePosition);

          if (previous.onNewLine)
            break;
        }
      } else if (this.currentLineBase !== null && glyph.baseline < this.currentLineBase) {
        glyph.drawRectangle = offsetRect(glyph.drawRectangle, 0, this.currentLineBase - glyph.baseline);
        this.currentLineHeight = Math.max(this.currentLineHeight, glyph.drawRectangle.bottom - glyph.linePosition);
      }

      this.currentLineHeight = Math.max(this.currentLineHeight, this.useFontSizeAsHeight ? this.font.size : glyph.height);
      this.currentLineBase = this.currentLineBase === null ? glyph.baseline : Math.max(this.currentLineBase, glyph.baseline);
    }

    this.characters.push(glyph);

    this.currentPosX += glyph.xAdvance;
    this.currentNewLine = false;

    this.bounds = Vector2.componentMax(this.bounds, new Vector2(this.currentPosX, this.currentPosY + this.currentLineHeight));
    return true;
  }

  /** Adds a new line to this TextBuilder. */
  addNewLine(): void {
    if (this.currentNewLine)
      this.currentLineHeight = this.font.size;

    // Reset + vertically offset the current position
    this.currentPosX = this.startOffset.x;
    this.currentPosY += this.currentLineHeight + this.spacing.y;

    this.currentLineBase = null;
    this.currentLineHeight = 0;
    this.currentNewLine = true;
  }

  /** Removes the last character added to this TextBuilder. If the character is the first character on a new line, the new line is also removed. */
  removeLastCharacter(): void {
    if (this.characters.length === 0)
      return;

    const removedCharacter = this.characters[this.characters.length - 1];
    const previousCharacter = this.characters.length === 1 ? null : this.characters[this.characters.length - 2];

    this.characters.pop();

    const lastLineBase = this.currentLineBase;
    this.currentLineBase = null;
    this.currentLineHeight = this.useFontSizeAsHeight ? this.font.size : 0;

    // This is O(n^2) for removing all characters within a line, but is generally not used in such a case
    for (let i = this.characters.length - 1; i >= 0; i--) {
      const character = this.characters[i];

      if (!isWhiteSpace(character)) {
        this.currentLineBase = this.currentLineBase === null ? character.baseline : Math.max(this.currentLineBase, character.baseline);
        this.currentLineHeight = Math.max(this.currentLineHeight, character.drawRectangle.bottom - character.linePosition);
      }

      if (character.onNewLine)
        break;
    }

    if (removedCharacter.onNewLine && previousCharacter !== null) {
      // Move up to the previous line
      this.currentPosY = previousCharacter.linePosition;

      // The character's draw rectangle is the only marker that keeps a constant state for the position, but it has the glyph's XOffset added into it
      // So the post-kerned position can be retrieved by taking the XOffset away, and the post-XAdvanced position is retrieved by adding the XAdvance back in
      this.currentPosX = previousCharacter.drawRectangle.left - previousCharacter.xOffset + previousCharacter.xAdvance;
    } else {
      // Move back within the current line, reversing the operations in AddCharacter()
      this.currentPosX -= removedCharacter.xAdvance;

      if (previousCharacter !== null)
        this.currentPosX -= removedCharacter.getKerning(previousCharacter) + this.spacing.x;

      // Adjust the alignment of the previous characters if the baseline position lowered after removing the character.
      if (this.currentLineBase !== null && lastLineBase !== null && this.currentLineBase < lastLineBase) {
        for (let i = this.characters.length - 1; i >= 0; i--) {
          const character = this.characters[i].clone();
          character.drawRectangle = offsetRect(character.drawRectangle, 0, this.currentLineBase - lastLineBase);
          this.characters[i] = character;

          if (character.onNewLine)
            break;
        }
      }
    }

    this.bounds = Vector2.Zero;

    for (const character of this.characters) {
      // As above, the bounds are calculated through the character draw rectangles
      const characterRightBound = character.drawRectangle.left - character.xOffset + character.xAdvance;
      const characterBottomBound = this.useFontSizeAsHeight ? character.linePosition + this.font.size : character.drawRectangle.bottom;

      this.bounds = Vector2.componentMax(this.bounds, new Vector2(characterRightBound, characterBottomBound));
    }

    // The new line is removed when the first character on the line is removed, thus the current position is never on a new line
    // after a character is removed except when there are no characters remaining in the builder
    if (this.characters.length === 0)
      this.currentNewLine = true;
  }

  /** Invoked when a character is being added that exceeds the maximum width of the text bounds. */
  protected onWidthExceeded(): void {}

  /** Whether there is enough space in the available text bounds. */
  protected hasAvailableSpace(length: number): boolean {
    return this.currentPosX + length <= this.maxWidth;
  }

  private constantWidth: number | null = null;

  private getConstantWidth(): number {
    return this.constantWidth ??= this.getTexturedGlyph(this.fixedWidthReferenceCharacter)?.width ?? 0;
  }

  private tryCreateGlyph(character: string): TextBuilderGlyph | null {
    const fontStoreGlyph = this.getTexturedGlyph(character);

    if (fontStoreGlyph === null)
      return null;

    if (this.font.fixedWidth && !this.neverFixedWidthCharacters.includes(character))
      return new TextBuilderGlyph(fontStoreGlyph, this.font.size, this.getConstantWidth(), this.useFontSizeAsHeight);

    return new TextBuilderGlyph(fontStoreGlyph, this.font.size, null, this.useFontSizeAsHeight);
  }

  private getTexturedGlyph(character: string): ITexturedCharacterGlyph | null {
    const tryGetGlyph = (c: string) => this.store.get(this.font.fontName, c)
      ?? this.store.get(this.font.fontNameNoFamily, c)
      ?? this.store.get('', c);

    return tryGetGlyph(character) ?? tryGetGlyph(this.fallbackCharacter);
  }
}

/** A TextBuilder that creates a new line when the maximum width is exceeded. */
export class MultilineTextBuilder extends TextBuilder {
  protected override onWidthExceeded(): void {
    this.addNewLine();
  }
}

/** A TextBuilder that truncates with an ellipsis when the maximum width is exceeded. */
export class TruncatingTextBuilder extends TextBuilder {
  /** Whether characters were truncated. */
  isTruncated = false;

  private readonly tStore: ITexturedGlyphLookupStore;
  private readonly tFont: FontUsage;
  private readonly ellipsisString: string | null;
  private readonly tUseFontSizeAsHeight: boolean;
  private readonly tSpacing: Vector2;
  private readonly tNeverFixedWidthCharacters: string[] | null;
  private readonly tFallbackCharacter: string;

  constructor(store: ITexturedGlyphLookupStore, font: FontUsage, maxWidth: number, ellipsisString: string | null = null, useFontSizeAsHeight = true,
              startOffset = Vector2.Zero, spacing = Vector2.Zero, characterList: TextBuilderGlyph[] | null = null, neverFixedWidthCharacters: string[] | null = null,
              fallbackCharacter = '?', fixedWidthReferenceCharacter = 'm') {
    super(store, font, maxWidth, useFontSizeAsHeight, startOffset, spacing, characterList, neverFixedWidthCharacters, fallbackCharacter, fixedWidthReferenceCharacter);

    this.tStore = store;
    this.tFont = font;
    this.ellipsisString = ellipsisString;
    this.tUseFontSizeAsHeight = useFontSizeAsHeight;
    this.tSpacing = spacing;
    this.tNeverFixedWidthCharacters = neverFixedWidthCharacters;
    this.tFallbackCharacter = fallbackCharacter;
  }

  override reset(): void {
    super.reset();
    this.isTruncated = false;
  }

  protected override get canAddCharacters(): boolean {
    return (super.canAddCharacters && !this.isTruncated) || this.addingEllipsis;
  }

  private addingEllipsis = false;

  protected override hasAvailableSpace(length: number): boolean {
    return super.hasAvailableSpace(length) || this.addingEllipsis;
  }

  protected override onWidthExceeded(): void {
    if (this.addingEllipsis)
      return;

    this.addingEllipsis = true;

    try {
      if (!this.ellipsisString)
        return;

      // Characters is re-used to reduce allocations, but must be reset after use
      const startIndex = this.characters.length;

      // Compute the ellipsis to find out the size required
      const builder = new TextBuilder(this.tStore, this.tFont, Number.MAX_VALUE, this.tUseFontSizeAsHeight, Vector2.Zero, this.tSpacing, this.characters,
        this.tNeverFixedWidthCharacters, this.tFallbackCharacter);
      builder.addText(this.ellipsisString);

      const ellipsisWidth = builder.bounds.x;
      const firstEllipsisGlyph = builder.characters[startIndex];

      this.characters.splice(startIndex, this.characters.length - startIndex);

      while (true) {
        this.removeLastCharacter();

        if (this.characters.length === 0)
          break;

        if (isWhiteSpace(this.characters[this.characters.length - 1]))
          continue;

        if (super.hasAvailableSpace(firstEllipsisGlyph.getKerning(this.characters[this.characters.length - 1]) + this.tSpacing.x + ellipsisWidth))
          break;
      }

      this.addText(this.ellipsisString);
    } finally {
      this.addingEllipsis = false;
      this.isTruncated = true;
    }
  }
}
