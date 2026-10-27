// Ported from osu.Game/Graphics/OsuFont.cs (OsuFont, OsuFontExtensions, Typeface, FontWeight)

import { FontUsage } from '@fw/text/FontUsage';

export enum Typeface {
  Venera,
  Torus,
  /** "Torus (alternate)" */
  TorusAlternate,
  Inter,
}

export enum FontWeight {
  Light = 300,
  Regular = 400,
  Medium = 500,
  SemiBold = 600,
  Bold = 700,
  Black = 900,
}

interface FontOptions {
  typeface?: Typeface;
  size?: number;
  weight?: FontWeight;
  italics?: boolean;
  fixedWidth?: boolean;
}

export class OsuFont {
  /** The default font size. */
  static readonly DEFAULT_FONT_SIZE = 16;

  static readonly Style = class {
    static get Title(): FontUsage { return OsuFont.getFont({ typeface: Typeface.TorusAlternate, size: 32, weight: FontWeight.Regular }); }
    static get Subtitle(): FontUsage { return OsuFont.getFont({ size: 28, weight: FontWeight.Regular }); }
    static get Heading1(): FontUsage { return OsuFont.getFont({ size: 22, weight: FontWeight.Bold }); }
    static get Heading2(): FontUsage { return OsuFont.getFont({ size: 18, weight: FontWeight.SemiBold }); }
    static get Body(): FontUsage { return OsuFont.getFont({ size: OsuFont.DEFAULT_FONT_SIZE, weight: FontWeight.Regular }); }
    static get Caption1(): FontUsage { return OsuFont.getFont({ size: 14, weight: FontWeight.Regular }); }
    static get Caption2(): FontUsage { return OsuFont.getFont({ size: 12, weight: FontWeight.Regular }); }
  };

  /** The default font. */
  static get Default(): FontUsage { return OsuFont.getFont({ weight: FontWeight.Medium }); }

  static get Numeric(): FontUsage { return OsuFont.getFont({ typeface: Typeface.Venera, weight: FontWeight.Bold }); }

  static get Torus(): FontUsage { return OsuFont.getFont({ typeface: Typeface.Torus, weight: FontWeight.Regular }); }

  static get TorusAlternate(): FontUsage { return OsuFont.getFont({ typeface: Typeface.TorusAlternate, weight: FontWeight.Regular }); }

  static get Inter(): FontUsage { return OsuFont.getFont({ typeface: Typeface.Inter, weight: FontWeight.Regular }); }

  /** Retrieves a FontUsage. */
  static getFont({ typeface = Typeface.Torus, size = OsuFont.DEFAULT_FONT_SIZE, weight = FontWeight.Medium, italics = false, fixedWidth = false }: FontOptions = {}): FontUsage {
    const familyString = OsuFont.getFamilyString(typeface);
    return new FontUsage(familyString, size, OsuFont.getWeightString(familyString, weight), getItalics(italics), fixedWidth);
  }

  /** Retrieves the string representation of a Typeface. */
  static getFamilyString(typeface: Typeface): string {
    switch (typeface) {
      case Typeface.Venera:
        return 'Venera';

      case Typeface.Torus:
        return 'Torus';

      case Typeface.TorusAlternate:
        return 'Torus-Alternate';

      case Typeface.Inter:
        return 'Inter';
    }
  }

  /** Retrieves the string representation of a FontWeight. */
  static getWeightString(family: string, weight: FontWeight): string {
    if ((family === OsuFont.getFamilyString(Typeface.Torus) || family === OsuFont.getFamilyString(Typeface.TorusAlternate)) && weight === FontWeight.Medium)
      // torus doesn't have a medium; fallback to regular.
      weight = FontWeight.Regular;

    return FontWeight[weight];
  }
}

function getItalics(_italicsRequested: boolean): boolean {
  // right now none of our fonts support italics.
  // should add exceptions to this rule if they come up.
  return false;
}

/** OsuFontExtensions.With: creates a new FontUsage by applying adjustments to this one. */
export function withFont(usage: FontUsage, { typeface, size, weight, italics, fixedWidth }: FontOptions = {}): FontUsage {
  const familyString = typeface !== undefined ? OsuFont.getFamilyString(typeface) : usage.family;
  const weightString = weight !== undefined ? OsuFont.getWeightString(familyString!, weight) : usage.weight;

  return usage.with({ family: familyString, size, weight: weightString, italics, fixedWidth });
}
