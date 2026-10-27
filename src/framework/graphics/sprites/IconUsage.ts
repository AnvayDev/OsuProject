// Ported from osu.Framework/Graphics/Sprites/IconUsage.cs

/** Represents a specific usage of an icon. */
export class IconUsage {
  /** The font family name. */
  readonly family: string | null;

  /** The font weight. */
  readonly weight: string | null;

  /**
   * The font's full name to be used for lookups. This is an aggregate of all other properties of IconUsage.
   * The format is of the form: {Family}, {Family}-Italic, {Family}-{Weight}Italic.
   */
  readonly fontName: string;

  /** The icon character (one UTF-16 code unit, as C#'s char). */
  readonly icon: string;

  /** Creates an instance of IconUsage using the specified font family and font weight. */
  constructor(icon: string, family: string | null = null, weight: string | null = null) {
    this.icon = icon;
    this.family = family;
    this.weight = weight;

    let fontName = (this.family ?? '') + '-';
    if (weight)
      fontName += weight;

    this.fontName = fontName.replace(/-+$/, '');
  }

  /** Creates a new IconUsage by applying adjustments to this IconUsage (null or omitted values are copied from this one). */
  with(o: { family?: string | null; weight?: string | null }): IconUsage {
    return new IconUsage(this.icon, o.family ?? this.family, o.weight ?? this.weight);
  }

  toString(): string {
    return `Icon=${this.icon} Font=${this.fontName}`;
  }

  equals(other: IconUsage): boolean {
    return this.icon === other.icon && this.family === other.family && this.weight === other.weight;
  }
}
