// Ported subset of osu.Game/Rulesets/Ruleset.cs: the mod lists, beatmap conversion and processing, and the scoring processors.

import type { IBeatmap } from '../beatmaps/Beatmap';
import type { IBeatmapConverter } from '../beatmaps/BeatmapConverter';
import type { IBeatmapProcessor } from '../beatmaps/BeatmapProcessor';
import type { Mod } from './mods/Mod';
import { MultiMod } from './mods/Mods';
import { ModType } from './mods/ModType';
import { RulesetInfo, RulesetStore } from './RulesetInfo';
import { DrainingHealthProcessor } from './scoring/DrainingHealthProcessor';
import type { HealthProcessor } from './scoring/HealthProcessor';
import { ScoreMultiplierCalculator, type ScoreMultiplierContext } from './scoring/ScoreMultiplierCalculator';
import { ScoreProcessor } from './scoring/ScoreProcessor';

const mod_reference_cache = new Map<string, readonly Mod[]>();

export abstract class Ruleset {
  abstract get shortName(): string;

  /** The RulesetInfo of this ruleset: the official one if there is one with this short name (C# builds it from the ruleset's own members). */
  get rulesetInfo(): RulesetInfo {
    return RulesetStore.getRuleset(this.shortName) ?? new RulesetInfo(this.shortName);
  }

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

  /** Creates the calculator of the score multiplier of a set of mods. */
  createScoreMultiplierCalculator(context: ScoreMultiplierContext): ScoreMultiplierCalculator {
    return new ScoreMultiplierCalculator(context);
  }

  /** Creates a ScoreProcessor for this Ruleset. */
  createScoreProcessor(): ScoreProcessor {
    return new ScoreProcessor(this);
  }

  /** Creates a HealthProcessor for this Ruleset. */
  createHealthProcessor(drainStartTime: number): HealthProcessor {
    return new DrainingHealthProcessor(drainStartTime);
  }
}
