// Ported from osu.Framework/Graphics/Sprites/FontUsage.cs

const default_text_size = 20;

/** Represents a specific usage of a font. */
export class FontUsage {
  /** Gets the default FontUsage. */
  static get Default(): FontUsage {
    return new FontUsage(null);
  }

  /** The font family name. */
  readonly family: string | null;

  /** The font weight. */
  readonly weight: string | null;

  /** Whether the font is italic. */
  readonly italics: boolean;

  /** The size of the font. */
  readonly size: number;

  /** Whether all characters should be spaced apart the same distance. */
  readonly fixedWidth: boolean;

  /** The font's full name to be used for lookups. This is an aggregate of all other properties of FontUsage. */
  readonly fontName: string;

  /** The font name without the family. */
  readonly fontNameNoFamily: string;

  constructor(family: string | null = null, size = default_text_size, weight: string | null = null, italics = false, fixedWidth = false) {
    if (size < 0) throw new RangeError('Must be non-negative.');

    this.family = family;
    this.size = size;
    this.weight = weight;
    this.italics = italics;
    this.fixedWidth = fixedWidth;

    let fontName = (family ?? '') + '-';

    if (weight)
      fontName += weight;

    if (italics)
      fontName += 'Italic';

    this.fontName = fontName.replace(/-+$/, '');

    this.fontNameNoFamily = !family ? this.fontName : this.fontName.substring(family.length);
  }

  /** Creates a new FontUsage by applying adjustments to this one. */
  with(o: { family?: string | null; size?: number | null; weight?: string | null; italics?: boolean | null; fixedWidth?: boolean | null }): FontUsage {
    return new FontUsage(o.family ?? this.family, o.size ?? this.size, o.weight ?? this.weight, o.italics ?? this.italics, o.fixedWidth ?? this.fixedWidth);
  }

  equals(other: FontUsage): boolean {
    return this.family === other.family && this.weight === other.weight && this.italics === other.italics && this.size === other.size && this.fixedWidth === other.fixedWidth;
  }

  toString(): string {
    return `Font=${this.fontName}, Size=${this.size}, Italics=${this.italics}, FixedWidth=${this.fixedWidth}`;
  }
}
