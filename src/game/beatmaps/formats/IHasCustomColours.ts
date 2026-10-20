// Ported from osu.Game/Beatmaps/Formats/IHasCustomColours.cs

import type { Colour4 } from '@fw/graphics/Colour4';

export interface IHasCustomColours {
  readonly customColours: Map<string, Colour4>;
}

export const hasCustomColours = (o: object): o is IHasCustomColours => 'customColours' in o;
