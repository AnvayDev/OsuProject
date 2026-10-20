// Ported from osu.Framework/IO/Stores/GlyphStore.cs, FontStore.cs, osu.Framework/Text/CharacterGlyph.cs, TexturedCharacterGlyph.cs.
// Fonts are BMFont atlases converted to JSON by scripts/build-fonts.mjs. A glyph texture is a rectangle of an atlas page;
// pages are images loaded on demand (SpriteText waits for its pages in load(), like osu! loads glyph textures there).

/** A rectangle of a font atlas page. Equivalent of the cropped glyph Texture in GlyphStore.LoadCharacter. */
export interface GlyphTexture {
  readonly pageUrl: string;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly x: number;
  readonly y: number;
  /** Pixel width/height of the glyph texture (Texture.Width/Height). */
  readonly width: number;
  readonly height: number;
}

export interface ICharacterGlyph {
  readonly xOffset: number;
  readonly yOffset: number;
  readonly xAdvance: number;
  readonly baseline: number;
  readonly character: string;
  getKerning(lastGlyph: ICharacterGlyph): number;
}

export interface ITexturedCharacterGlyph extends ICharacterGlyph {
  readonly texture: GlyphTexture;
  readonly width: number;
  readonly height: number;
}

/** CharacterGlyphExtensions.IsWhiteSpace: char.IsWhiteSpace(glyph.Character). */
export function isWhiteSpace(glyph: ICharacterGlyph): boolean {
  return /\s/.test(glyph.character);
}

interface FontJson {
  size: number;
  base: number;
  lineHeight: number;
  scaleW: number;
  scaleH: number;
  pages: string[];
  /** [id, x, y, width, height, xoffset, yoffset, xadvance, page] */
  chars: [number, number, number, number, number, number, number, number, number][];
  /** [first, second, amount] */
  kernings: [number, number, number][];
}

type BmChar = FontJson['chars'][number];

/** A glyph store for a single BMFont (GlyphStore). */
export class GlyphStore {
  /** The font name (last segment of the asset name, e.g. "Torus-Bold"). */
  readonly fontName: string;

  private font: FontJson | null = null;
  private chars = new Map<number, BmChar>();
  private kernings = new Map<number, number>();
  private readonly baseUrl: string;

  constructor(readonly assetName: string, assetRoot: string) {
    this.fontName = assetName.split('/').pop() ?? '';
    this.baseUrl = `${assetRoot}/${assetName.substring(0, assetName.lastIndexOf('/') + 1)}`;
    this.assetUrl = `${assetRoot}/${assetName}.json`;
  }

  private readonly assetUrl: string;
  private loadTask: Promise<void> | null = null;

  loadFontAsync(): Promise<void> {
    return this.loadTask ??= fetch(this.assetUrl).then(r => {
      if (!r.ok) throw new Error(`Couldn't load font asset from ${this.assetName}.`);
      return r.json() as Promise<FontJson>;
    }).then(font => this.setFont(font));
  }

  /** @internal For tests / pre-fetched metrics. */
  setFont(font: FontJson): void {
    this.font = font;
    this.chars = new Map(font.chars.map(c => [c[0], c]));
    this.kernings = new Map(font.kernings.map(([a, b, amount]) => [a * 0x10000 + b, amount]));
  }

  get baseline(): number | null {
    return this.font?.base ?? null;
  }

  hasGlyph(c: string): boolean {
    return this.chars.has(c.charCodeAt(0));
  }

  get(character: string): CharacterGlyph | null {
    if (this.font === null)
      return null;

    const bmCharacter = this.chars.get(character.charCodeAt(0));
    if (bmCharacter === undefined) return null;

    return new CharacterGlyph(character, bmCharacter[5], bmCharacter[6], bmCharacter[7], this.font.base, this);
  }

  getKerning(left: string, right: string): number {
    return this.kernings.get(left.charCodeAt(0) * 0x10000 + right.charCodeAt(0)) ?? 0;
  }

  /** The texture (atlas rectangle) of a character. */
  getTexture(character: string): GlyphTexture | null {
    const c = this.chars.get(character.charCodeAt(0));
    if (c === undefined || this.font === null) return null;

    return {
      pageUrl: this.baseUrl + this.font.pages[c[8]],
      pageWidth: this.font.scaleW,
      pageHeight: this.font.scaleH,
      x: c[1],
      y: c[2],
      width: c[3],
      height: c[4],
    };
  }
}

export class CharacterGlyph implements ICharacterGlyph {
  constructor(
    readonly character: string,
    readonly xOffset: number,
    readonly yOffset: number,
    readonly xAdvance: number,
    readonly baseline: number,
    private readonly containingStore: GlyphStore | null,
  ) {}

  getKerning(lastGlyph: ICharacterGlyph): number {
    return this.containingStore?.getKerning(lastGlyph.character, this.character) ?? 0;
  }
}

/** A CharacterGlyph with a texture, scaled by 1 / FontStore.ScaleAdjust. */
export class TexturedCharacterGlyph implements ITexturedCharacterGlyph {
  constructor(private readonly glyph: CharacterGlyph, readonly texture: GlyphTexture, readonly scale = 1) {}

  get xOffset(): number { return this.glyph.xOffset * this.scale; }
  get yOffset(): number { return this.glyph.yOffset * this.scale; }
  get xAdvance(): number { return this.glyph.xAdvance * this.scale; }
  get baseline(): number { return this.glyph.baseline * this.scale; }
  get character(): string { return this.glyph.character; }
  get width(): number { return this.texture.width * this.scale; }
  get height(): number { return this.texture.height * this.scale; }

  getKerning(lastGlyph: ICharacterGlyph): number {
    return this.glyph.getKerning(lastGlyph) * this.scale;
  }
}

/** Looks up glyphs by font name (ITexturedGlyphLookupStore). */
export interface ITexturedGlyphLookupStore {
  get(fontName: string | null, character: string): ITexturedCharacterGlyph | null;
}

const pageLoads = new Map<string, Promise<void>>();

/** Ensures an atlas page image is decoded (so glyphs appear on the first frame they are shown). */
export function loadPage(url: string): Promise<void> {
  let p = pageLoads.get(url);

  if (p === undefined) {
    const img = new Image();
    img.src = url;
    p = img.decode().catch(() => undefined);
    pageLoads.set(url, p);
  }

  return p;
}

/** A font store (FontStore with scaleAdjust = 100: the raw pixel height of the fonts). Nested stores are searched after own glyph stores. */
export class FontStore implements ITexturedGlyphLookupStore {
  private readonly glyphStores: GlyphStore[] = [];
  private readonly nestedFontStores: FontStore[] = [];
  private readonly namespacedGlyphCache = new Map<string, ITexturedCharacterGlyph | null>();

  constructor(readonly scaleAdjust = 100) {}

  addGlyphStore(store: GlyphStore): void {
    this.glyphStores.push(store);
    this.namespacedGlyphCache.clear();
  }

  addStore(store: FontStore): void {
    this.nestedFontStores.push(store);
    this.namespacedGlyphCache.clear();
  }

  /** Loads all glyph store metrics (C# loads them asynchronously when added). */
  loadAll(): Promise<void> {
    return Promise.all([...this.glyphStores.map(s => s.loadFontAsync()), ...this.nestedFontStores.map(s => s.loadAll())]).then(() => undefined);
  }

  get(fontName: string | null, character: string): ITexturedCharacterGlyph | null {
    const key = `${fontName}\u0000${character}`;
    const existing = this.namespacedGlyphCache.get(key);
    if (existing !== undefined)
      return existing;

    for (const store of this.glyphStores) {
      if (store.fontName.endsWith(fontName ?? '') && store.hasGlyph(character)) {
        const glyph = new TexturedCharacterGlyph(store.get(character)!, store.getTexture(character)!, 1 / this.scaleAdjust);
        this.namespacedGlyphCache.set(key, glyph);
        return glyph;
      }
    }

    for (const store of this.nestedFontStores) {
      const glyph = store.get(fontName, character);

      if (glyph !== null) {
        this.namespacedGlyphCache.set(key, glyph);
        return glyph;
      }
    }

    this.namespacedGlyphCache.set(key, null);
    return null;
  }
}
