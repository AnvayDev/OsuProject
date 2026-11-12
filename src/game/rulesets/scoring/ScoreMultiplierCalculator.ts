// Ported from osu.Game/Rulesets/Scoring/ScoreMultiplierCalculator.cs

import type { IBeatmapDifficultyInfo } from '../../beatmaps/BeatmapDifficulty';
import type { ScoreInfo } from '../../scoring/ScoreInfo';
import type { Mod } from '../mods/Mod';

type ModType<T extends Mod = Mod> = abstract new (...args: never[]) => T;

/** Describes the context in which score multipliers are calculated. */
export class ScoreMultiplierContext {
  /**
   * @param beatmapDifficultyWithoutMods Difficulty of the beatmap that was played, before mods.
   * @param score The score being calculated, if any (used to pick the multipliers its version was set with).
   */
  constructor(readonly beatmapDifficultyWithoutMods: IBeatmapDifficultyInfo, readonly score: ScoreInfo | null = null) {}
}

/**
 * Calculates the score multiplier of a set of mods. A ruleset's calculator declares a multiplier for single mods and for combinations
 * of two mods; a combination takes precedence over the single multipliers of the mods in it.
 * (C# keys these by exact type, `mod.GetType()`: a mod's subclass does not inherit its multiplier.)
 */
export class ScoreMultiplierCalculator {
  private readonly combinationMultipliers: { mods: ModType[]; multiplier: (mods: Mod[]) => number }[] = [];
  private readonly singleMultipliers = new Map<ModType, (mod: Mod) => number>();

  constructor(protected readonly context: ScoreMultiplierContext) {}

  /** Declares the multiplier of a single mod: a constant, or a function of the mod's settings. */
  protected single<T extends Mod>(type: ModType<T>, hasMultiplier: number | ((mod: T) => number)): void {
    this.singleMultipliers.set(type, typeof hasMultiplier === 'number' ? () => hasMultiplier : mod => hasMultiplier(mod as T));
  }

  /** Declares the multiplier of two mods used together. */
  protected combination<T1 extends Mod, T2 extends Mod>(type1: ModType<T1>, type2: ModType<T2>, hasMultiplier: (mod1: T1, mod2: T2) => number): void {
    this.combinationMultipliers.push({ mods: [type1, type2], multiplier: mods => hasMultiplier(mods[0] as T1, mods[1] as T2) });
  }

  calculateFor(mods: Iterable<Mod>): number {
    const allModsByType = new Map<ModType, Mod>();

    for (const m of mods)
      allModsByType.set(m.constructor as ModType, m);

    if (allModsByType.size === 0)
      return 1;

    const remainingModTypes = new Set(allModsByType.keys());

    let result = 1;

    if (allModsByType.size > 1) {
      for (const { mods: combination, multiplier } of this.combinationMultipliers) {
        if (combination.every(t => remainingModTypes.has(t))) {
          result *= multiplier(combination.map(t => allModsByType.get(t)!));

          for (const t of combination)
            remainingModTypes.delete(t);
        }
      }
    }

    for (const modType of remainingModTypes) {
      const multiplier = this.singleMultipliers.get(modType);

      if (multiplier !== undefined)
        result *= multiplier(allModsByType.get(modType)!);
    }

    return result;
  }
}
