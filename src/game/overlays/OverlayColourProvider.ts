// Ported from osu.Game/Overlays/OverlayColourProvider.cs
// C# overloads the constructor and ChangeColourScheme on OverlayColourScheme and int (a hue in degrees). OverlayColourScheme is a numeric enum,
// so the overloads cannot be told apart: the scheme overloads keep the C# names and the hue overloads are `fromHue` and `changeColourSchemeHue`.
// (getHue throws for a number that is not a scheme, so a hue passed to a scheme overload fails loudly.)

import { Colour4 } from '@fw/graphics/Colour4';
import { getHue, type OverlayColourScheme } from './OverlayColourScheme';

export class OverlayColourProvider {
  private _hue: number;

  /** The hue degree associated with the colour shades provided by this OverlayColourProvider. */
  get hue(): number {
    return this._hue;
  }

  constructor(colourScheme: OverlayColourScheme) {
    this._hue = getHue(colourScheme);
  }

  /** OverlayColourProvider(int hue) */
  static fromHue(hue: number): OverlayColourProvider {
    const provider = Object.create(OverlayColourProvider.prototype) as OverlayColourProvider;
    provider._hue = hue;
    return provider;
  }

  // Note that the following five colours are also defined in `OsuColour` as `{colourScheme}{0,1,2,3,4}`.
  // The difference as to which should be used where comes down to context.
  // If the colour in question is supposed to always match the view in which it is displayed theme-wise, use `OverlayColourProvider`.
  // If the colour usage is special and in general differs from the surrounding view in choice of hue, use the `OsuColour` constants.
  get colour0(): Colour4 { return this.getColour(1, 0.8); }
  get colour1(): Colour4 { return this.getColour(1, 0.7); }
  get colour2(): Colour4 { return this.getColour(0.8, 0.6); }
  get colour3(): Colour4 { return this.getColour(0.6, 0.5); }
  get colour4(): Colour4 { return this.getColour(0.4, 0.3); }

  get highlight1(): Colour4 { return this.getColour(1, 0.7); }
  get content1(): Colour4 { return this.getColour(0.4, 1); }
  get content2(): Colour4 { return this.getColour(0.4, 0.9); }
  get light1(): Colour4 { return this.getColour(0.4, 0.8); }
  get light2(): Colour4 { return this.getColour(0.4, 0.75); }
  get light3(): Colour4 { return this.getColour(0.4, 0.7); }
  get light4(): Colour4 { return this.getColour(0.4, 0.5); }
  get dark1(): Colour4 { return this.getColour(0.2, 0.35); }
  get dark2(): Colour4 { return this.getColour(0.2, 0.3); }
  get dark3(): Colour4 { return this.getColour(0.2, 0.25); }
  get dark4(): Colour4 { return this.getColour(0.2, 0.2); }
  get dark5(): Colour4 { return this.getColour(0.2, 0.15); }
  get dark6(): Colour4 { return this.getColour(0.2, 0.1); }
  get foreground1(): Colour4 { return this.getColour(0.1, 0.6); }
  get background1(): Colour4 { return this.getColour(0.1, 0.4); }
  get background2(): Colour4 { return this.getColour(0.1, 0.3); }
  get background3(): Colour4 { return this.getColour(0.1, 0.25); }
  get background4(): Colour4 { return this.getColour(0.1, 0.2); }
  get background5(): Colour4 { return this.getColour(0.1, 0.15); }
  get background6(): Colour4 { return this.getColour(0.1, 0.1); }

  /**
   * Changes the hue to a different degree.
   * Note that this does not trigger any kind of signal to any drawable that received colours from here, all drawables need to be updated manually.
   */
  changeColourScheme(colourScheme: OverlayColourScheme): void {
    this.changeColourSchemeHue(getHue(colourScheme));
  }

  /**
   * Changes the hue to a different degree (ChangeColourScheme(int hue)).
   * Note that this does not trigger any kind of signal to any drawable that received colours from here, all drawables need to be updated manually.
   */
  changeColourSchemeHue(hue: number): void {
    this._hue = hue;
  }

  private getColour(saturation: number, lightness: number): Colour4 {
    return Colour4.fromHSL(this.hue / 360, saturation, lightness);
  }
}
