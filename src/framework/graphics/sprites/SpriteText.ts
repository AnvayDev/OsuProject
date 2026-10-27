// Ported from osu.Framework/Graphics/Sprites/SpriteText.cs and SpriteText.DrawNode.cs (localisation omitted: text is a plain string).
// DOM: one div for all glyphs (a mask layer per glyph, an image of its rectangle of the atlas page, at the glyph's DrawRectangle; the draw
// colour is the background), and one below it for the shadow. (One masked div per glyph made text-heavy screens composite slowly.)
// SpriteTextDrawNode.Draw interleaves each glyph's shadow right before it, which only differs where glyphs overlap.

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { BindableWithCurrent, type Bindable } from '../../bindables/Bindable';
import { Axes, Invalidation, LoadState } from '../../layout/Enums';
import { InvalidationSource, LayoutValue, LayoutValueOf } from '../../layout/Layout';
import { MarginPadding } from '../../layout/MarginPadding';
import { Vector2 } from '../../layout/Vector2';
import { FontStore, glyphImageUrl, loadPage } from '../../text/FontStore';
import { FontUsage } from '../../text/FontUsage';
import { MultilineTextBuilder, TextBuilder, TruncatingTextBuilder, type TextBuilderGlyph } from '../../text/TextBuilder';
import { Colour4 } from '../Colour4';
import { ColourInfo } from '../ColourInfo';
import { Drawable } from '../Drawable';
import { colourInfoToCss } from './Sprite';

const default_never_fixed_width_characters = ['.', ',', ':', ' ', ' ', ' '];

/**
 * The glyph elements are laid out this many times larger and scaled down: Chrome snaps mask and background layer positions and sizes to
 * whole pixels of the element's own (unscaled) space, which displaced glyphs visibly once the scene graph scales them up.
 */
const glyph_layer_scale = 16;

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

    const pending = [...pages].map(loadPage).filter(p => p !== undefined);

    if (pending.length > 0)
      return Promise.all(pending).then(() => undefined);
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

  /** The glyphs of the shadow (below) and of the text. */
  private shadowElement: HTMLElement | null = null;
  private textElement: HTMLElement | null = null;

  // The masks are only rewritten when the characters change, and the colours when the draw colour changes (it carries the alpha of every
  // parent, so fades change it every frame): re-setting a mask makes Chrome reload its images, which skips drawing the glyphs for a frame.
  private maskedCharactersVersion = -1;
  private mask = '';
  private glyphLayers: string[] = [];
  private glyphBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  private lastColourKey = '';

  protected override applyElementState(): void {
    super.applyElementState();

    const colour = this.drawColourInfo.colour;

    // shadowAlpha: adjust shadow alpha based on highest component intensity to avoid muddy display of darker text.
    // squared result for quadratic fall-off seems to give the best result.
    const avgColour = colour.averageColour;
    const shadowAlpha = Math.pow(Math.max(avgColour.r, avgColour.g, avgColour.b), 2);
    const finalShadowColour = colour.applyChild(ColourInfo.singleColour(this._shadowColour.multiplyAlpha(shadowAlpha)));

    const shadowOffset = this._shadowOffset.mul(this._font.size);

    if (this._shadow && this.shadowElement === null) {
      this.shadowElement = this.createGlyphsElement(this.textElement);
      this.shadowElement.style.setProperty('mask', this.mask);
      this.shadowElement.style.setProperty('-webkit-mask', this.mask);
    }

    this.textElement ??= this.createGlyphsElement(null);

    const charactersChanged = this.charactersVersion !== this.maskedCharactersVersion;

    if (charactersChanged)
      this.updateMasks();

    const colourKey = `${colour}|${this._shadow ? `${finalShadowColour}|${shadowOffset}` : ''}`;
    if (!charactersChanged && colourKey === this.lastColourKey)
      return;

    this.lastColourKey = colourKey;

    const { left, top, right, bottom } = this.glyphBounds;

    // Each glyph quad is drawn with the whole draw colour (SpriteTextDrawNode.Draw): a non-uniform colour is a background layer per glyph.
    const place = (el: HTMLElement, dx: number, dy: number, c: ColourInfo) => {
      if (this.glyphLayers.length === 0) {
        el.style.display = 'none';
        return;
      }

      const css = colourInfoToCss(c, true);

      el.style.display = '';
      el.style.transform = `translate(${left + dx}px, ${top + dy}px) scale(${1 / glyph_layer_scale})`;
      el.style.width = `${(right - left) * glyph_layer_scale}px`;
      el.style.height = `${(bottom - top) * glyph_layer_scale}px`;
      el.style.background = c.hasSingleColour ? css : this.glyphLayers.map(l => `${css} ${l}`).join(', ');
    };

    if (this._shadow)
      place(this.shadowElement!, shadowOffset.x, shadowOffset.y, finalShadowColour);
    else if (this.shadowElement !== null)
      this.shadowElement.style.display = 'none';

    place(this.textElement, 0, 0, colour);
  }

  /** Lays out a mask layer per glyph, within the bounds of all glyph rectangles. */
  private updateMasks(): void {
    const characters = this.characters;
    this.maskedCharactersVersion = this.charactersVersion;

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const c of characters) {
      const rect = c.drawRectangle;
      if (rect.width <= 0 || rect.height <= 0)
        continue;

      left = Math.min(left, rect.x);
      top = Math.min(top, rect.y);
      right = Math.max(right, rect.x + rect.width);
      bottom = Math.max(bottom, rect.y + rect.height);
    }

    const masks: string[] = [];
    const layers: string[] = [];
    const k = glyph_layer_scale;

    for (const c of characters) {
      const rect = c.drawRectangle;
      if (rect.width <= 0 || rect.height <= 0)
        continue;

      const url = glyphImageUrl(c.texture);

      // the page isn't decoded yet (e.g. after a font change): draw again once it is.
      if (url === null) {
        this.maskedCharactersVersion = -1;
        void loadPage(c.texture.pageUrl)?.then(() => this.invalidate(Invalidation.DrawNode));
        continue;
      }

      const layer = `${(rect.x - left) * k}px ${(rect.y - top) * k}px / ${rect.width * k}px ${rect.height * k}px no-repeat`;
      masks.push(`url("${url}") ${layer}`);
      layers.push(layer);
    }

    this.glyphLayers = layers;
    this.glyphBounds = { left, top, right, bottom };

    const mask = masks.join(', ');
    if (mask === this.mask)
      return;

    this.mask = mask;

    for (const el of [this.shadowElement, this.textElement]) {
      el?.style.setProperty('mask', mask);
      el?.style.setProperty('-webkit-mask', mask);
    }
  }

  private createGlyphsElement(before: HTMLElement | null): HTMLElement {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.transformOrigin = '0 0';
    this.element.insertBefore(el, before);
    return el;
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
