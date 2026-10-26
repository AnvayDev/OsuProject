// Ported from osu.Game/Screens/Select/ISongSelect.cs
// C# marks the interface [Cached]; DI keys are classes here, so it is an abstract class that song select extends and caches as ISongSelect.
// Only the members used by ported components are declared (the context menu and score presentation actions aren't ported).

import type { Bindable } from '@fw/bindables/Bindable';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';

/** Actions exposed by song select which are used by subcomponents to perform top-level operations. */
export abstract class ISongSelect {
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
