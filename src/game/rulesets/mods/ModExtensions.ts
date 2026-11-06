// Ported from osu.Game/Rulesets/Mods/ModExtensions.cs (AsOrdered).

import type { Mod } from './Mod';

/** Orders mods by type, then acronym (ordinal). */
export function asOrdered(mods: readonly Mod[]): Mod[] {
  return [...mods].sort((a, b) => a.type - b.type || (a.acronym < b.acronym ? -1 : a.acronym > b.acronym ? 1 : 0));
}
