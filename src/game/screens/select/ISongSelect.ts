// Ported from osu.Game/Screens/Select/ISongSelect.cs
// C# marks the interface [Cached]; DI keys are classes here, so it is an abstract class song select is cached as. SongSelect already has a base
// class, so instanceof (which the container's cacheAs checks) recognises implementations by their members.
// Only the members used by ported components are declared (score presentation isn't ported).

import type { Bindable } from '@fw/bindables/Bindable';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import type { OsuMenuItem } from '../../graphics/userInterface/OsuMenuItem';

/** Actions exposed by song select which are used by subcomponents to perform top-level operations. */
export abstract class ISongSelect {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return typeof instance === 'object' && instance !== null
      && typeof (instance as ISongSelect).scopeToBeatmapSet === 'function'
      && typeof (instance as ISongSelect).unscopeBeatmapSet === 'function'
      && typeof (instance as ISongSelect).addToSearch === 'function'
      && 'scopedBeatmapSet' in instance;
  }

  /** Requests the user for confirmation to delete the given beatmap set. */
  abstract delete(beatmapSet: BeatmapSetInfo): void;

  /** Immediately restores any hidden beatmaps in the provided beatmap set. */
  abstract restoreAllHidden(beatmapSet: BeatmapSetInfo): void;

  /** Add provided string to the current filter text query. */
  abstract addToSearch(query: string): void;

  /** Gets relevant actionable items for beatmap context menus, based on the type of song select. */
  abstract getForwardActions(beatmap: BeatmapInfo): OsuMenuItem[];

  /** Temporarily bypasses filters and shows all difficulties of the given beatmapset. */
  abstract scopeToBeatmapSet(beatmapSet: BeatmapSetInfo): void;

  /** Removes the beatmapset scope and reverts the previously selected filters. */
  abstract unscopeBeatmapSet(): void;

  /**
   * Contains the currently scoped beatmapset. Used by external consumers for displaying its state.
   * Cannot be used to change the value, any changes must be done through scopeToBeatmapSet or unscopeBeatmapSet.
   */
  abstract get scopedBeatmapSet(): Bindable<BeatmapSetInfo | null>;
}
