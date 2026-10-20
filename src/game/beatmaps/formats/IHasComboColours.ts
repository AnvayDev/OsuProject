// Ported from osu.Game/Beatmaps/Formats/IHasComboColours.cs

import type { Colour4 } from '@fw/graphics/Colour4';

export interface IHasComboColours {
  /** Retrieves the list of combo colours for presentation only. */
  readonly comboColours: readonly Colour4[] | null;

  /** The list of custom combo colours. If non-empty, comboColours will return these colours; if empty, comboColours will fall back to default combo colours. */
  readonly customComboColours: Colour4[];
}

export const hasComboColours = (o: object): o is IHasComboColours => 'customComboColours' in o;
