// Ported from osu.Game/Overlays/OverlayColourScheme.cs (the enum and OverlayColourSchemeExtensions.GetHue).

export enum OverlayColourScheme {
  Red,
  Orange,
  Lime,
  Green,
  Aquamarine,
  Blue,
  Purple,
  Plum,
  Pink,
}

/** OverlayColourSchemeExtensions.GetHue */
export function getHue(colourScheme: OverlayColourScheme): number {
  // See https://github.com/ppy/osu-web/blob/5a536d217a21582aad999db50a981003d3ad5659/app/helpers.php#L1620-L1628
  switch (colourScheme) {
    default:
      throw new RangeError(`colourScheme ${colourScheme} is out of range.`);

    case OverlayColourScheme.Red:
      return 0;

    case OverlayColourScheme.Orange:
      return 45;

    case OverlayColourScheme.Lime:
      return 90;

    case OverlayColourScheme.Green:
      return 125;

    case OverlayColourScheme.Aquamarine:
      return 160;

    case OverlayColourScheme.Blue:
      return 200;

    case OverlayColourScheme.Purple:
      return 255;

    case OverlayColourScheme.Plum:
      return 320;

    case OverlayColourScheme.Pink:
      return 333;
  }
}
