// Ported from osu.Framework/Graphics/Sprites/SpriteText.cs and SpriteText.DrawNode.cs (localisation omitted: text is a plain string).
// DOM: one masked div per glyph (the atlas page is the mask, the draw colour is the background), positioned at the glyph's
// DrawRectangle. Shadows are drawn per glyph right before it, exactly as SpriteTextDrawNode.Draw interleaves them.

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { BindableWithCurrent, type Bindable } from '../../bindables/Bindable';
import { Axes, Invalidation, LoadState } from '../../layout/Enums';
import { InvalidationSource, LayoutValue, LayoutValueOf } from '../../layout/Layout';
import { MarginPadding } from '../../layout/MarginPadding';
import { Vector2 } from '../../layout/Vector2';
import { FontStore, loadPage } from '../../text/FontStore';
import { FontUsage } from '../../text/FontUsage';
import { MultilineTextBuilder, TextBuilder, TruncatingTextBuilder, type TextBuilderGlyph } from '../../text/TextBuilder';
import { Colour4 } from '../Colour4';
import { ColourInfo } from '../ColourInfo';
import { Drawable } from '../Drawable';
import { colourInfoToCss } from './Sprite';

const default_never_fixed_width_characters = ['.', ',', ':', ' ', ' ', ' '];

/** Transparent padding around narrow glyph elements, and the width below which it is applied (see applyElementState). */
const glyph_element_padding = 2;
const min_unpadded_glyph_width = 3;

/** A container for simple text rendering purposes. If more complex text rendering is required, use TextFlowContainer instead. */
export class SpriteText extends Drawable {
  private store: FontStore | null = null;

  constructor() {
    super();

    this.currentBindable.bindValueChanged(text => {
      if (text.newValue !== this._text)
        this.text = text.newValue;
    });

    this.addLayout(this.charactersCache);
    this.addLayout(this.shadowOffsetCache);
    this.addLayout(this.textBuilderCache);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    super.load(dependencies);

    this.store = dependencies.resolve(FontStore);

    // Pre-cache the characters in the texture store (the atlas pages holding them).
    return this.loadPages(this._text);
  }

  private loadPages(text: string): Promise<void> | void {
    if (this.store === null) return;

    const pages = new Set<string>();

    for (let i = 0; i < text.length; i++) {
      const glyph = this.store.get(this._font.fontName, text[i]) ?? this.store.get(null, text[i]);
      if (glyph !== null) pages.add(glyph.texture.pageUrl);
    }

    if (pages.size > 0)
      return Promise.all([...pages].map(loadPage)).then(() => undefined);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.currentBindable.value = this._text;
  }

  private _text = '';

  /** Gets or sets the text to be displayed. */
  get text(): string {
    return this._text;
  }

  set text(value: string) {
    value ??= '';

    if (this._text === value)
      return;

    this._text = value;
    this.currentBindable.value = value;

    if (this.loadState >= LoadState.Ready)
      void this.loadPages(value)?.then(() => this.invalidate(Invalidation.DrawNode));

    if (!value) {
      // We'll become not present and won't update the characters to set the size to 0, so do it manually
      if (this.requiresAutoSizedWidth)
        super.width = this._padding.totalHorizontal;
      if (this.requiresAutoSizedHeight)
        super.height = this._padding.totalVertical;
    }

    this.invalidateText(true);
    this.invalidate(Invalidation.Presence | Invalidation.DrawNode);
  }

  private readonly currentBindable = new BindableWithCurrent<string>('');

  get current(): Bindable<string> {
    return this.currentBindable.current;
  }

  set current(value: Bindable<string>) {
    this.currentBindable.current = value;
  }

  private get displayedText(): string {
    return this._text;
  }

  private _font = FontUsage.Default;

  /** Contains information on the font used to display the text. */
  get font(): FontUsage {
    return this._font;
  }

  set font(value: FontUsage) {
    this._font = value;

    this.invalidateText(true, true);
    this.shadowOffsetCache.invalidate();
  }

  private _allowMultiline = true;

  /** True if the text should be wrapped if it gets too wide. Note that \n does NOT cause a line break. If you require explicit line breaks, use TextFlowContainer instead. */
  get allowMultiline(): boolean {
    return this._allowMultiline;
  }

  set allowMultiline(value: boolean) {
    if (this._allowMultiline === value)
      return;

    if (value)
      this.truncate = false;

    this._allowMultiline = value;
    this.invalidateText(true, true);
  }

  private _shadow = false;

  /** True if a shadow should be displayed around the text. */
  get shadow(): boolean {
    return this._shadow;
  }

  set shadow(value: boolean) {
    if (this._shadow === value)
      return;

    this._shadow = value;

    this.invalidate(Invalidation.DrawNode);
  }

  private _shadowColour = new Colour4(0, 0, 0, 0.2);

  /** The colour of the shadow displayed around the text. A shadow will only be displayed if the shadow property is set to true. */
  get shadowColour(): Colour4 {
    return this._shadowColour;
  }

  set shadowColour(value: Colour4) {
    if (this._shadowColour.equals(value))
      return;

    this._shadowColour = value;

    this.invalidate(Invalidation.DrawNode);
  }

  private _shadowOffset = new Vector2(0, 0.06);

  /** The offset of the shadow displayed around the text, relative to the font size. */
  get shadowOffset(): Vector2 {
    return this._shadowOffset;
  }

  set shadowOffset(value: Vector2) {
    if (this._shadowOffset.equals(value))
      return;

    this._shadowOffset = value;

    this.invalidateText(true);
    this.shadowOffsetCache.invalidate();
  }

  private _useFullGlyphHeight = true;

  /** True if the SpriteText's vertical size should be equal to font size (default) or false if it should be equal to the visible height of the glyphs. */
  get useFullGlyphHeight(): boolean {
    return this._useFullGlyphHeight;
  }

  set useFullGlyphHeight(value: boolean) {
    if (this._useFullGlyphHeight === value)
      return;

    this._useFullGlyphHeight = value;

    this.invalidateText(true, true);
  }

  private _truncate = false;

  /** If true, text should be truncated when it exceeds the DrawWidth of this SpriteText. */
  get truncate(): boolean {
    return this._truncate;
  }

  set truncate(value: boolean) {
    if (this._truncate === value) return;

    if (value)
      this.allowMultiline = false;

    this._truncate = value;
    this.invalidateText(true, true);
  }

  private _ellipsisString = '…';

  /** When truncate is enabled, this decides what string is used to signify that truncation has occured. */
  get ellipsisString(): string {
    return this._ellipsisString;
  }

  set ellipsisString(value: string) {
    if (this._ellipsisString === value) return;

    this._ellipsisString = value;
    this.invalidateText(true, true);
  }

  /** Whether the text is currently truncated. */
  isTruncated = false;

  private get requiresAutoSizedWidth(): boolean {
    return this.explicitWidth === null && (this.relativeSizeAxes & Axes.X) === 0;
  }

  private get requiresAutoSizedHeight(): boolean {
    return this.explicitHeight === null && (this.relativeSizeAxes & Axes.Y) === 0;
  }

  private explicitWidth: number | null = null;

  /** Gets or sets the width of this SpriteText. The SpriteText will maintain this width when set. */
  override get width(): number {
    if (this.requiresAutoSizedWidth)
      this.computeCharacters();

    return super.width;
  }

  override set width(value: number) {
    if (this.explicitWidth === value)
      return;

    super.width = value;
    this.explicitWidth = value;

    this.invalidateText(true, true);
  }

  private _maxWidth = Number.POSITIVE_INFINITY;

  /** The maximum width of this SpriteText. Affects both auto and fixed sizing modes. */
  get maxWidth(): number {
    return this._maxWidth;
  }

  set maxWidth(value: number) {
    if (this._maxWidth === value)
      return;

    this._maxWidth = value;
    this.invalidateText(true, true);
  }

  private explicitHeight: number | null = null;

  /** Gets or sets the height of this SpriteText. The SpriteText will maintain this height when set. */
  override get height(): number {
    if (this.requiresAutoSizedHeight)
      this.computeCharacters();

    return super.height;
  }

  override set height(value: number) {
    if (this.explicitHeight === value)
      return;

    super.height = value;
    this.explicitHeight = value;

    this.invalidateText(true, true);
  }

  /** Gets or sets the size of this SpriteText. The SpriteText will maintain this size when set. */
  override get size(): Vector2 {
    if (this.requiresAutoSizedWidth || this.requiresAutoSizedHeight)
      this.computeCharacters();

    return super.size;
  }

  override set size(value: Vector2) {
    this.width = value.x;
    this.height = value.y;
  }

  private _spacing = Vector2.Zero;

  /** Gets or sets the spacing between characters of this SpriteText. */
  get spacing(): Vector2 {
    return this._spacing;
  }

  set spacing(value: Vector2) {
    if (this._spacing.equals(value))
      return;

    this._spacing = value;

    this.invalidateText(true, true);
  }

  private _padding = MarginPadding.Zero;

  /** Shrinks the space which may be occupied by characters of this SpriteText by the specified amount on each side. */
  get padding(): MarginPadding {
    return this._padding;
  }

  set padding(value: MarginPadding) {
    if (this._padding.equals(value))
      return;

    this._padding = value;

    this.invalidateText(true, true);
  }

  override get isPresent(): boolean {
    return super.isPresent && (this.alwaysPresent || !!this.displayedText);
  }

  // #region Characters

  private readonly charactersCache = new LayoutValue(Invalidation.DrawSize | Invalidation.Presence, InvalidationSource.Parent);

  /** The characters that should be drawn. */
  private readonly charactersBacking: TextBuilderGlyph[] = [];

  private get characters(): TextBuilderGlyph[] {
    this.computeCharacters();
    return this.charactersBacking;
  }

  private charactersVersion = 0;

  /** Compute character textures and positions. */
  private computeCharacters(): void {
    if (this.store === null)
      return;

    if (this.charactersCache.isValid)
      return;

    this.isTruncated = false;
    this.charactersBacking.length = 0;
    this.charactersVersion++;

    let textBounds = Vector2.Zero;

    try {
      if (!this.displayedText)
        return;

      const textBuilder = this.getTextBuilder();

      textBuilder.reset();
      textBuilder.addText(this.displayedText);
      textBounds = textBuilder.bounds;

      if (textBuilder instanceof TruncatingTextBuilder)
        this.isTruncated = textBuilder.isTruncated;
    } finally {
      if (this.requiresAutoSizedWidth)
        super.width = textBounds.x + this._padding.right;
      if (this.requiresAutoSizedHeight)
        super.height = textBounds.y + this._padding.bottom;

      super.width = Math.min(super.width, this.maxWidth);

      this.charactersCache.validate();
    }
  }

  private readonly shadowOffsetCache = new LayoutValueOf<Vector2>(Invalidation.DrawInfo, InvalidationSource.Parent);

  // #endregion

  // #region Invalidation

  private invalidateText(characters = false, textBuilder = false): void {
    if (characters)
      this.charactersCache.invalidate();

    if (textBuilder)
      this.invalidateTextBuilder();

    this.invalidate(Invalidation.RequiredParentSizeToFit);
  }

  // #endregion

  // #region DrawNode (DOM)

  private glyphElements: HTMLElement[] = [];
  private lastGlyphKey = '';

  protected override applyElementState(): void {
    super.applyElementState();

    const characters = this.characters;
    const colour = this.drawColourInfo.colour;

    // shadowAlpha: adjust shadow alpha based on highest component intensity to avoid muddy display of darker text.
    // squared result for quadratic fall-off seems to give the best result.
    const avgColour = colour.averageColour;
    const shadowAlpha = Math.pow(Math.max(avgColour.r, avgColour.g, avgColour.b), 2);
    const finalShadowColour = colour.applyChild(ColourInfo.singleColour(this._shadowColour.multiplyAlpha(shadowAlpha)));

    const shadowOffset = this._shadowOffset.mul(this._font.size);

    const key = `${this.charactersVersion}|${colour}|${this._shadow ? `${finalShadowColour}|${shadowOffset}` : ''}`;
    if (key === this.lastGlyphKey)
      return;

    this.lastGlyphKey = key;

    const fill = colourInfoToCss(colour, true);
    const shadowFill = colourInfoToCss(finalShadowColour, true);

    let n = 0;
    const next = () => {
      let el = this.glyphElements[n];

      if (el === undefined) {
        el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.setProperty('mask-repeat', 'no-repeat');
        el.style.setProperty('-webkit-mask-repeat', 'no-repeat');
        el.style.setProperty('mask-clip', 'content-box');
        el.style.setProperty('-webkit-mask-clip', 'content-box');
        this.element.appendChild(el);
        this.glyphElements.push(el);
      }

      n++;
      return el;
    };

    for (const c of characters) {
      const rect = c.drawRectangle;
      const tex = c.texture;

      if (rect.width <= 0 || rect.height <= 0)
        continue;

      const sx = rect.width / tex.width;
      const sy = rect.height / tex.height;
      const mask = `url("${tex.pageUrl}")`;
      const maskSize = `${tex.pageWidth * sx}px ${tex.pageHeight * sy}px`;
      // Chrome skips painting masked elements narrower than ~2 device pixels inside the scaled scene graph (e.g. a 14px "!"), so narrow glyph
      // elements get a transparent padding: the mask is offset by the padding and clipped to the content box, which is the glyph rectangle.
      // (Only narrow ones: the clip is snapped to device pixels, which can cut into wider glyphs.)
      const pad = rect.width < min_unpadded_glyph_width ? glyph_element_padding : 0;
      const maskPos = `${-tex.x * sx + pad}px ${-tex.y * sy + pad}px`;

      const place = (el: HTMLElement, dx: number, dy: number, bg: string) => {
        el.style.transform = `translate(${rect.x + dx - pad}px, ${rect.y + dy - pad}px)`;
        el.style.padding = `${pad}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        el.style.background = bg;
        el.style.setProperty('mask-image', mask);
        el.style.setProperty('-webkit-mask-image', mask);
        el.style.setProperty('mask-size', maskSize);
        el.style.setProperty('-webkit-mask-size', maskSize);
        el.style.setProperty('mask-position', maskPos);
        el.style.setProperty('-webkit-mask-position', maskPos);
        el.style.display = '';
      };

      if (this._shadow)
        place(next(), shadowOffset.x, shadowOffset.y, shadowFill);

      place(next(), 0, 0, fill);
    }

    for (let i = n; i < this.glyphElements.length; i++)
      this.glyphElements[i].style.display = 'none';
  }

  // #endregion

  /** The characters which should be excluded from fixed-width application. Defaults to the default never-fixed-width characters (null). */
  protected get fixedWidthExcludeCharacters(): string[] | null {
    return null;
  }

  /** The character to use to calculate the fixed width width. Defaults to 'm'. */
  protected get fixedWidthReferenceCharacter(): string {
    return 'm';
  }

  /** The character to fallback to use if a character glyph lookup failed. */
  protected get fallbackCharacter(): string {
    return '•';
  }

  private readonly textBuilderCache = new LayoutValueOf<TextBuilder>(Invalidation.DrawSize, InvalidationSource.Parent);

  /** Invalidates the current TextBuilder, causing a new one to be created next time it's required via createTextBuilder. */
  protected invalidateTextBuilder(): void {
    this.textBuilderCache.invalidate();
  }

  /** Creates a TextBuilder to generate the character layout for this SpriteText. */
  protected createTextBuilder(store: FontStore): TextBuilder {
    const excludeCharacters = this.fixedWidthExcludeCharacters ?? default_never_fixed_width_characters;

    const builderMaxWidth = this.requiresAutoSizedWidth
      ? this.maxWidth
      : this.applyRelativeAxes(this.relativeSizeAxes, new Vector2(Math.min(this.maxWidth, super.width), super.height), this.fillMode).x - this._padding.right;

    const offset = new Vector2(this._padding.left, this._padding.top);

    if (this.allowMultiline) {
      return new MultilineTextBuilder(store, this._font, builderMaxWidth, this.useFullGlyphHeight, offset, this.spacing, this.charactersBacking,
        excludeCharacters, this.fallbackCharacter, this.fixedWidthReferenceCharacter);
    }

    if (this.truncate) {
      return new TruncatingTextBuilder(store, this._font, builderMaxWidth, this._ellipsisString, this.useFullGlyphHeight, offset, this.spacing, this.charactersBacking,
        excludeCharacters, this.fallbackCharacter, this.fixedWidthReferenceCharacter);
    }

    return new TextBuilder(store, this._font, builderMaxWidth, this.useFullGlyphHeight, offset, this.spacing, this.charactersBacking,
      excludeCharacters, this.fallbackCharacter, this.fixedWidthReferenceCharacter);
  }

  private getTextBuilder(): TextBuilder {
    if (!this.textBuilderCache.isValid)
      this.textBuilderCache.value = this.createTextBuilder(this.store!);

    return this.textBuilderCache.value;
  }

  override toString(): string {
    return `"${this.displayedText}" ${super.toString()}`;
  }

  /** The base height of the line (distance from the top to the baseline). */
  get lineBaseHeight(): number {
    this.computeCharacters();
    return this.textBuilderCache.value.lineBaseHeight;
  }
}
