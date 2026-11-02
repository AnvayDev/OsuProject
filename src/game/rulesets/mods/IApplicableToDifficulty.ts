// Ported from osu.Game/Rulesets/Mods/IApplicableToDifficulty.cs
// TS interfaces don't exist at runtime: implementations are recognised by their members (instanceof uses Symbol.hasInstance).

import type { BeatmapDifficulty } from '../../beatmaps/BeatmapDifficulty';

/** An interface for mods that make general adjustments to difficulty. */
export abstract class IApplicableToDifficulty {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return typeof (instance as IApplicableToDifficulty | null)?.applyToDifficulty === 'function';
  }

  /** Called when a beatmap is changed. Can be used to read default values. Any changes made will not be preserved. */
  readFromDifficulty?(difficulty: BeatmapDifficulty): void;

  /** Called post beatmap conversion. Can be used to apply changes to difficulty attributes. */
  abstract applyToDifficulty(difficulty: BeatmapDifficulty): void;
}
