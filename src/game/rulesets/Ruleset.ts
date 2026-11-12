// Ported subset of osu.Game/Rulesets/Ruleset.cs: the mod lists, and beatmap conversion and processing.

import type { IBeatmap } from '../beatmaps/Beatmap';
import type { IBeatmapConverter } from '../beatmaps/BeatmapConverter';
import type { IBeatmapProcessor } from '../beatmaps/BeatmapProcessor';
import type { Mod } from './mods/Mod';
import { MultiMod } from './mods/Mods';
import { ModType } from './mods/ModType';

const mod_reference_cache = new Map<string, readonly Mod[]>();

export abstract class Ruleset {
  abstract get shortName(): string;

  /**
   * A queryable source containing all available mods. Call createInstance() for consumption purposes.
   * (Instances shared for reference purposes: their settings must not be changed.)
   */
  get allMods(): readonly Mod[] {
    let mods = mod_reference_cache.get(this.shortName);
    if (mods === undefined)
      mod_reference_cache.set(this.shortName, mods = this.createAllMods());

    return mods;
  }

  /** Returns fresh instances of all mods. */
  createAllMods(): Mod[] {
    return (Object.values(ModType).filter(v => typeof v === 'number') as ModType[])
      // Confine all mods of each mod type into a single list
      .flatMap(type => this.getModsFor(type))
      // Resolve MultiMods as their .Mods property
      .flatMap(mod => mod instanceof MultiMod ? mod.mods : [mod]);
  }

  /** Returns a fresh instance of the mod matching the specified acronym. */
  createModFromAcronym(acronym: string): Mod | null {
    return this.allMods.find(m => m.acronym.toLowerCase() === acronym.toLowerCase())?.createInstance() ?? null;
  }

  /** Creates the mods that are supported by the ruleset for the supplied type (empty if there are none). */
  abstract getModsFor(type: ModType): Mod[];

  /** Creates a IBeatmapConverter to convert a IBeatmap to one that is applicable for this Ruleset. */
  abstract createBeatmapConverter(beatmap: IBeatmap): IBeatmapConverter;

  /** Optionally creates a IBeatmapProcessor to alter a IBeatmap after it has been converted. */
  createBeatmapProcessor(_beatmap: IBeatmap): IBeatmapProcessor | null {
    return null;
  }
}
