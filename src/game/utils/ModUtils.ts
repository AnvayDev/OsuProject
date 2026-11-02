// Ported from osu.Game/Utils/ModUtils.cs (the parts used outside multiplayer and the online API).
// C#'s `out List<Mod>? invalidMods` overloads return the invalid mods, or null when the check passes.

import { IApplicableToRate } from '../rulesets/mods/IApplicableToRate';
import type { Mod, ModTypeReference } from '../rulesets/mods/Mod';
import { MultiMod } from '../rulesets/mods/Mods';

/** A set of utilities to handle Mod combinations. */
export const ModUtils = {
  /** Checks that all Mods are compatible with each-other, and that all appear within a set of allowed types. */
  checkCompatibleSetAndAllowed(combination: readonly Mod[], allowedTypes: readonly ModTypeReference[]): boolean {
    return ModUtils.checkCompatibleSet(combination) === null && ModUtils.checkAllowed(combination, allowedTypes);
  },

  /** Checks that all Mods in a combination are compatible with each-other. Returns the invalid mods, or null if the combination is compatible. */
  checkCompatibleSet(combination: readonly Mod[]): Mod[] | null {
    const mods = ModUtils.flattenMods(combination);
    let invalidMods: Mod[] | null = null;

    // ensure there are no duplicate mod definitions.
    for (let i = 0; i < mods.length; i++) {
      const candidate = mods[i];

      for (let j = i + 1; j < mods.length; j++) {
        const m = mods[j];

        if (candidate.constructor === m.constructor)
          (invalidMods ??= []).push(m);
      }
    }

    for (const mod of mods) {
      for (const type of mod.incompatibleMods) {
        for (const invalid of mods.filter(m => m instanceof type)) {
          if (invalid === mod)
            continue;

          (invalidMods ??= []).push(invalid);
        }
      }
    }

    return invalidMods;
  },

  /** Checks that all Mods in a combination appear within a set of allowed types. */
  checkAllowed(combination: readonly Mod[], allowedTypes: readonly ModTypeReference[]): boolean {
    const allowedSet = new Set<unknown>(allowedTypes);

    return combination.flatMap(m => ModUtils.flattenMod(m)).every(m => allowedSet.has(m.constructor));
  },

  /** Checks that all mods in a combination are valid for a local gameplay session. Returns the invalid mods, or null if all are valid. */
  checkValidForGameplay(mods: readonly Mod[]): Mod[] | null {
    // checking compatibility of multi mods would try to flatten them and return incompatible mods.
    // in gameplay context, we never want MultiMod selected in the first place, therefore check against it first.
    return checkValid(mods, m => !(m instanceof MultiMod))
      ?? ModUtils.checkCompatibleSet(mods)
      ?? checkValid(mods, m => m.hasImplementation);
  },

  /** Flattens a set of Mods, returning a new set with all MultiMods removed. */
  flattenMods(mods: readonly Mod[]): Mod[] {
    return mods.flatMap(m => ModUtils.flattenMod(m));
  },

  /** Flattens a Mod, returning a set of Mods in-place of any MultiMods. */
  flattenMod(mod: Mod): Mod[] {
    return mod instanceof MultiMod ? mod.mods.flatMap(m => ModUtils.flattenMod(m)) : [mod];
  },

  /** Formats a score multiplier for display ("0.00x"), rounding away from 1.00x to two significant digits. */
  formatScoreMultiplier(scoreMultiplier: number): string {
    // Round multiplier values away from 1.00x to two significant digits.
    if (scoreMultiplier > 1)
      scoreMultiplier = Math.ceil(roundTo(scoreMultiplier * 100, 4)) / 100;
    else
      scoreMultiplier = Math.floor(roundTo(scoreMultiplier * 100, 4)) / 100;

    return `${scoreMultiplier.toFixed(2)}x`;
  },

  /** Calculate the rate for the song with the selected mods. */
  calculateRateWithMods(mods: readonly Mod[]): number {
    let rate = 1;

    // TODO: This doesn't consider mods which apply variable rates, yet.
    for (const mod of mods) {
      if (mod instanceof IApplicableToRate)
        rate = mod.applyToRate(0, rate);
    }

    return rate;
  },
};

function checkValid(mods: readonly Mod[], valid: (mod: Mod) => boolean): Mod[] | null {
  const invalidMods = mods.filter(m => !valid(m));
  return invalidMods.length > 0 ? invalidMods : null;
}

/** (Math.Round(value, digits)) */
function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
