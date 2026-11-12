// Ported from osu.Game/Skinning/GlobalSkinColours.cs, SkinComboColourLookup.cs and SkinCustomColourLookup.cs

import type { IHasComboInformation } from '../rulesets/objects/types/Types';

export enum GlobalSkinColours {
  ComboColours,
  MenuGlow,
}

/**
 * A GlobalSkinColours value as a config lookup. C# passes the enum value itself and dispatches on its type; a TypeScript enum value is
 * just a number, so it is wrapped to stay distinguishable from other lookups.
 */
export class GlobalSkinColoursLookup {
  constructor(readonly colours: GlobalSkinColours) {}
}

export class SkinComboColourLookup {
  /**
   * @param colourIndex The index to use for deciding the combo colour.
   * @param combo The combo information, should be this of the caller object.
   */
  constructor(readonly colourIndex: number, readonly combo: IHasComboInformation) {}
}

export class SkinCustomColourLookup {
  constructor(readonly lookup: unknown) {}
}
