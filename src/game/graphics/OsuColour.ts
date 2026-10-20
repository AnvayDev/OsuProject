// Ported from osu.Game/Graphics/OsuColour.cs
// ForRank, ForHitResult, ForModType, ForRoomCategory, ForRoomStatus and ForRankingTier are not ported: they colour gameplay, multiplayer and
// ranking types this port doesn't have.

import { Colour4 } from '@fw/graphics/Colour4';
import { BeatmapOnlineStatus } from '../beatmaps/BeatmapOnlineStatus';
import { ColourUtils } from '../utils/ColourUtils';

/** Math.Round(value, 2, MidpointRounding.AwayFromZero), then the (float) cast. */
const roundStars = (value: number): number => Math.fround(Math.sign(value) * Math.round(Math.abs(value) * 100) / 100);

export class OsuColour {
  static gray(amt: number): Colour4 {
    return new Colour4(amt, amt, amt, 1);
  }

  /** Gray(byte amt). */
  static grayByte(amt: number): Colour4 {
    return Colour4.fromBytes(amt, amt, amt, 255);
  }

  /** The maximum star rating colour which can be distinguished against a black background. */
  static readonly STAR_DIFFICULTY_DEFINED_COLOUR_CUTOFF = Math.fround(6.5);

  /** The maximum star rating colour which should use a gradient. */
  static readonly STAR_DIFFICULTY_TEXT_GRADIENT_CUTOFF = Math.fround(9.0);

  static readonly STAR_DIFFICULTY_SPECTRUM: readonly (readonly [number, Colour4])[] = [
    [Math.fround(0.1), Colour4.fromHex('aaaaaa')],
    [Math.fround(0.1), Colour4.fromHex('4290fb')],
    [Math.fround(1.25), Colour4.fromHex('4fc0ff')],
    [Math.fround(2.0), Colour4.fromHex('4fffd5')],
    [Math.fround(2.5), Colour4.fromHex('7cff4f')],
    [Math.fround(3.3), Colour4.fromHex('f6f05c')],
    [Math.fround(4.2), Colour4.fromHex('ff8068')],
    [Math.fround(4.9), Colour4.fromHex('ff4e6f')],
    [Math.fround(5.8), Colour4.fromHex('c645b8')],
    [Math.fround(6.7), Colour4.fromHex('6563de')],
    [Math.fround(7.7), Colour4.fromHex('18158e')],
    [Math.fround(9.0), Colour4.Black],
    [Math.fround(10.0), Colour4.Black],
  ];

  static readonly STAR_DIFFICULTY_TEXT_SPECTRUM: readonly (readonly [number, Colour4])[] = [
    [Math.fround(9.0), Colour4.fromHex('f6f05c')],
    [Math.fround(9.9), Colour4.fromHex('ff8068')],
    [Math.fround(10.6), Colour4.fromHex('ff4e6f')],
    [Math.fround(11.5), Colour4.fromHex('c645b8')],
    [Math.fround(12.4), Colour4.fromHex('6563de')],
  ];

  /** Retrieves the colour for a given point in the star range. */
  forStarDifficulty(starDifficulty: number): Colour4 {
    return ColourUtils.sampleFromLinearGradient(OsuColour.STAR_DIFFICULTY_SPECTRUM, roundStars(starDifficulty));
  }

  /** Retrieves the colour for text displayed on top of a star difficulty colour. */
  forStarDifficultyText(starDifficulty: number): Colour4 {
    if (starDifficulty < OsuColour.STAR_DIFFICULTY_DEFINED_COLOUR_CUTOFF)
      return Colour4.Black.opacity(0.75);

    if (starDifficulty < OsuColour.STAR_DIFFICULTY_TEXT_GRADIENT_CUTOFF)
      return this.orange1;

    return ColourUtils.sampleFromLinearGradient(OsuColour.STAR_DIFFICULTY_TEXT_SPECTRUM, roundStars(starDifficulty));
  }

  /** Retrieves a colour for the given BeatmapOnlineStatus. A null value indicates that no colour should be displayed. */
  static forBeatmapSetOnlineStatus(status: BeatmapOnlineStatus): Colour4 | null {
    switch (status) {
      case BeatmapOnlineStatus.None:
        return Colour4.RosyBrown;

      case BeatmapOnlineStatus.LocallyModified:
        return Colour4.OrangeRed;

      case BeatmapOnlineStatus.Ranked:
      case BeatmapOnlineStatus.Approved:
        return Colour4.fromHex('b3ff66');

      case BeatmapOnlineStatus.Loved:
        return Colour4.fromHex('ff66ab');

      case BeatmapOnlineStatus.Qualified:
        return Colour4.fromHex('66ccff');

      case BeatmapOnlineStatus.Pending:
        return Colour4.fromHex('ffd966');

      case BeatmapOnlineStatus.WIP:
        return Colour4.fromHex('ff9966');

      case BeatmapOnlineStatus.Graveyard:
        return Colour4.Black;

      default:
        return null;
    }
  }

  /** Returns a foreground text colour that is supposed to contrast well with the supplied backgroundColour. */
  static foregroundTextColourFor(backgroundColour: Colour4): Colour4 {
    // formula taken from the RGB->YIQ conversions: https://en.wikipedia.org/wiki/YIQ
    // brightness here is equivalent to the Y component in the above colour model, which is a rough estimate of lightness.
    const brightness = Math.fround(0.299 * backgroundColour.r + 0.587 * backgroundColour.g + 0.114 * backgroundColour.b);
    return OsuColour.gray(brightness > 0.5 ? 0.2 : 0.9);
  }

  readonly teamColourRed = Colour4.fromHex('AA1414');
  readonly teamColourBlue = Colour4.fromHex('1462AA');
  // See https://github.com/ppy/osu-web/blob/master/resources/assets/less/colors.less
  readonly purpleLighter = Colour4.fromHex('eeeeff');
  readonly purpleLight = Colour4.fromHex('aa88ff');
  readonly purpleLightAlternative = Colour4.fromHex('cba4da');
  readonly purple = Colour4.fromHex('8866ee');
  readonly purpleDark = Colour4.fromHex('6644cc');
  readonly purpleDarkAlternative = Colour4.fromHex('312436');
  readonly purpleDarker = Colour4.fromHex('441188');
  readonly pinkLighter = Colour4.fromHex('ffddee');
  readonly pinkLight = Colour4.fromHex('ff99cc');
  readonly pink = Colour4.fromHex('ff66aa');
  readonly pinkDark = Colour4.fromHex('cc5288');
  readonly pinkDarker = Colour4.fromHex('bb1177');
  readonly blueLighter = Colour4.fromHex('ddffff');
  readonly blueLight = Colour4.fromHex('99eeff');
  readonly blue = Colour4.fromHex('66ccff');
  readonly blueDark = Colour4.fromHex('44aadd');
  readonly blueDarker = Colour4.fromHex('2299bb');
  readonly yellowLighter = Colour4.fromHex('ffffdd');
  readonly yellowLight = Colour4.fromHex('ffdd55');
  readonly yellow = Colour4.fromHex('ffcc22');
  readonly yellowDark = Colour4.fromHex('eeaa00');
  readonly yellowDarker = Colour4.fromHex('cc6600');
  readonly greenLighter = Colour4.fromHex('eeffcc');
  readonly greenLight = Colour4.fromHex('b3d944');
  readonly green = Colour4.fromHex('88b300');
  readonly greenDark = Colour4.fromHex('668800');
  readonly greenDarker = Colour4.fromHex('445500');
  readonly sky = Colour4.fromHex('6bb5ff');
  readonly greySkyLighter = Colour4.fromHex('c6e3f4');
  readonly greySkyLight = Colour4.fromHex('8ab3cc');
  readonly greySky = Colour4.fromHex('405461');
  readonly greySkyDark = Colour4.fromHex('303d47');
  readonly greySkyDarker = Colour4.fromHex('21272c');
  readonly seaFoam = Colour4.fromHex('05ffa2');
  readonly greySeaFoamLighter = Colour4.fromHex('9ebab1');
  readonly greySeaFoamLight = Colour4.fromHex('4d7365');
  readonly greySeaFoam = Colour4.fromHex('33413c');
  readonly greySeaFoamDark = Colour4.fromHex('2c3532');
  readonly greySeaFoamDarker = Colour4.fromHex('1e2422');
  readonly cyan = Colour4.fromHex('05f4fd');
  readonly greyCyanLighter = Colour4.fromHex('77b1b3');
  readonly greyCyanLight = Colour4.fromHex('436d6f');
  readonly greyCyan = Colour4.fromHex('293d3e');
  readonly greyCyanDark = Colour4.fromHex('243536');
  readonly greyCyanDarker = Colour4.fromHex('1e2929');
  readonly lime = Colour4.fromHex('82ff05');
  readonly greyLimeLighter = Colour4.fromHex('deff87');
  readonly greyLimeLight = Colour4.fromHex('657259');
  readonly greyLime = Colour4.fromHex('3f443a');
  readonly greyLimeDark = Colour4.fromHex('32352e');
  readonly greyLimeDarker = Colour4.fromHex('2e302b');
  readonly violet = Colour4.fromHex('bf04ff');
  readonly greyVioletLighter = Colour4.fromHex('ebb8fe');
  readonly greyVioletLight = Colour4.fromHex('685370');
  readonly greyViolet = Colour4.fromHex('46334d');
  readonly greyVioletDark = Colour4.fromHex('2c2230');
  readonly greyVioletDarker = Colour4.fromHex('201823');
  readonly carmine = Colour4.fromHex('ff0542');
  readonly greyCarmineLighter = Colour4.fromHex('deaab4');
  readonly greyCarmineLight = Colour4.fromHex('644f53');
  readonly greyCarmine = Colour4.fromHex('342b2d');
  readonly greyCarmineDark = Colour4.fromHex('302a2b');
  readonly greyCarmineDarker = Colour4.fromHex('241d1e');
  readonly gray0 = Colour4.fromHex('000');
  readonly gray1 = Colour4.fromHex('111');
  readonly gray2 = Colour4.fromHex('222');
  readonly gray3 = Colour4.fromHex('333');
  readonly gray4 = Colour4.fromHex('444');
  readonly gray5 = Colour4.fromHex('555');
  readonly gray6 = Colour4.fromHex('666');
  readonly gray7 = Colour4.fromHex('777');
  readonly gray8 = Colour4.fromHex('888');
  readonly gray9 = Colour4.fromHex('999');
  readonly grayA = Colour4.fromHex('aaa');
  readonly grayB = Colour4.fromHex('bbb');
  readonly grayC = Colour4.fromHex('ccc');
  readonly grayD = Colour4.fromHex('ddd');
  readonly grayE = Colour4.fromHex('eee');
  readonly grayF = Colour4.fromHex('fff');
  // #region "Basic" colour theme
  // Reference: https://www.figma.com/file/VIkXMYNPMtQem2RJg9k2iQ/Asset%2FColours?node-id=1838%3A3
  // Note that the colours in this region are also defined in `OverlayColourProvider` as `Colour{0,1,2,3,4}`.
  // The difference as to which should be used where comes down to context.
  // If the colour in question is supposed to always match the view in which it is displayed theme-wise, use `OverlayColourProvider`.
  // If the colour usage is special and in general differs from the surrounding view in choice of hue, use the `OsuColour` constants.
  readonly pink0 = Colour4.fromHex('ff99c7');
  readonly pink1 = Colour4.fromHex('ff66ab');
  readonly pink2 = Colour4.fromHex('eb4791');
  readonly pink3 = Colour4.fromHex('cc3378');
  readonly pink4 = Colour4.fromHex('6b2e49');
  readonly purple0 = Colour4.fromHex('b299ff');
  readonly purple1 = Colour4.fromHex('8c66ff');
  readonly purple2 = Colour4.fromHex('7047eb');
  readonly purple3 = Colour4.fromHex('5933cc');
  readonly purple4 = Colour4.fromHex('3d2e6b');
  readonly blue0 = Colour4.fromHex('99ddff');
  readonly blue1 = Colour4.fromHex('66ccff');
  readonly blue2 = Colour4.fromHex('47b4eb');
  readonly blue3 = Colour4.fromHex('3399cc');
  readonly blue4 = Colour4.fromHex('2e576b');
  readonly green0 = Colour4.fromHex('99ffa2');
  readonly green1 = Colour4.fromHex('66ff73');
  readonly green2 = Colour4.fromHex('47eb55');
  readonly green3 = Colour4.fromHex('33cc40');
  readonly green4 = Colour4.fromHex('2e6b33');
  readonly lime0 = Colour4.fromHex('ccff99');
  readonly lime1 = Colour4.fromHex('b2ff66');
  readonly lime2 = Colour4.fromHex('99eb47');
  readonly lime3 = Colour4.fromHex('7fcc33');
  readonly lime4 = Colour4.fromHex('4c6b2e');
  readonly orange0 = Colour4.fromHex('ffe699');
  readonly orange1 = Colour4.fromHex('ffd966');
  readonly orange2 = Colour4.fromHex('ebc247');
  readonly orange3 = Colour4.fromHex('cca633');
  readonly orange4 = Colour4.fromHex('6b5c2e');
  readonly darkOrange0 = Colour4.fromHex('ffbb99');
  readonly darkOrange1 = Colour4.fromHex('ff9966');
  readonly darkOrange2 = Colour4.fromHex('eb7e47');
  readonly darkOrange3 = Colour4.fromHex('cc6633');
  readonly darkOrange4 = Colour4.fromHex('6b422e');
  readonly red0 = Colour4.fromHex('ff9b9b');
  readonly red1 = Colour4.fromHex('ff6666');
  readonly red2 = Colour4.fromHex('eb4747');
  readonly red3 = Colour4.fromHex('cc3333');
  readonly red4 = Colour4.fromHex('6b2e2e');
  // #endregion
  // Content Background
  readonly b5 = Colour4.fromHex('222a28');
  readonly redLighter = Colour4.fromHex('ffeded');
  readonly redLight = Colour4.fromHex('ed7787');
  readonly red = Colour4.fromHex('ed1121');
  readonly redDark = Colour4.fromHex('ba0011');
  readonly redDarker = Colour4.fromHex('870000');
  readonly chatBlue = Colour4.fromHex('17292e');
  readonly contextMenuGray = Colour4.fromHex('223034');

  get spotlightColour(): Colour4 { return this.green2; }
  get featuredArtistColour(): Colour4 { return this.blue2; }
  get dangerousButtonColour(): Colour4 { return this.pink3; }
}
