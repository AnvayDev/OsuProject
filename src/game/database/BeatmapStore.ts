// Ported from osu.Game/Database/BeatmapStore.cs

import type { BindableList } from '@fw/bindables/BindableList';
import { Component } from '@fw/graphics/Component';
import type { BeatmapSetInfo } from '../beatmaps/BeatmapSetInfo';

/**
 * A store which contains a thread-safe representation of beatmaps available game-wide.
 * This exposes changes to available beatmaps, such as post-import or deletion.
 *
 * The main goal of classes which implement this interface should be to provide change
 * tracking and thread safety in a performant way, rather than having to worry about such
 * concerns at the point of usage.
 */
export abstract class BeatmapStore extends Component {
  /**
   * Get all available beatmaps.
   * It is generally expected that once a beatmap store is in a good state, the overhead of this call should be negligible.
   * @returns A bindable list of all available beatmap sets.
   */
  abstract getBeatmapSets(): BindableList<BeatmapSetInfo>;
}
