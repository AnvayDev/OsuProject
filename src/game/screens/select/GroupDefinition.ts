// Ported from osu.Game/Screens/Select/BeatmapCarousel.cs (the model records at the end of the file; kept separate so that the filters don't import
// the carousel).
// C# records compare by value and key dictionaries by that value. Here each model has a `key` string carrying the same equality, which the
// grouping filter's maps are keyed by. RankDisplayGroupDefinition isn't ported: with no local scores, rank grouping only yields "Unplayed".

import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import { BeatmapOnlineStatus, getOnlineStatusDescription } from '../../beatmaps/BeatmapOnlineStatus';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';

/** Defines a grouping header for a set of carousel items. */
export class GroupDefinition {
  /** The order of this group in the carousel, sorted using ascending order. */
  readonly order: number;

  /** The title of this group. */
  readonly title: string;

  private readonly uncasedTitle: string;

  constructor(order: number, title: string) {
    this.order = order;
    this.title = title;
    this.uncasedTitle = title.toLowerCase();
  }

  get key(): string {
    return `group:${this.uncasedTitle}`;
  }

  equals(other: GroupDefinition | null): boolean {
    return other !== null && this.key === other.key;
  }
}

/** The star difficulty of a group (StarDifficulty; only the stars are used). */
export interface StarDifficulty {
  readonly stars: number;
  readonly maxCombo: number;
}

/** Defines a grouping header for a set of carousel items grouped by star difficulty. */
export class StarDifficultyGroupDefinition extends GroupDefinition {
  constructor(order: number, title: string, readonly difficulty: StarDifficulty) {
    super(order, title);
  }

  override get key(): string {
    return `stars:${super.key}|${this.difficulty.stars}|${this.difficulty.maxCombo}`;
  }
}

/** Defines a grouping header for a set of carousel items grouped by ranked status. */
export class RankedStatusGroupDefinition extends GroupDefinition {
  constructor(order: number, readonly status: BeatmapOnlineStatus) {
    super(order, getOnlineStatusDescription(status));
  }

  override get key(): string {
    return `status:${super.key}|${this.status}`;
  }
}

/**
 * Used to represent a portion of a BeatmapSetInfo under a GroupDefinition.
 * The purpose of this model is to support splitting beatmap sets apart when the active grouping mode demands it.
 */
export class GroupedBeatmapSet {
  constructor(readonly group: GroupDefinition | null, readonly beatmapSet: BeatmapSetInfo) {}

  get key(): string {
    return `set:${this.group?.key ?? ''}|${this.beatmapSet.id}`;
  }

  equals(other: GroupedBeatmapSet | null): boolean {
    return other !== null && this.key === other.key;
  }
}

/**
 * Used to represent a Beatmap under a GroupDefinition.
 * The purpose of this model is to support showing multiple copies of a beatmap, which can occur if a beatmap appears in multiple groups
 * (most prominently, collections group mode).
 */
export class GroupedBeatmap {
  constructor(readonly group: GroupDefinition | null, readonly beatmap: BeatmapInfo) {}

  get key(): string {
    return `beatmap:${this.group?.key ?? ''}|${this.beatmap.id}`;
  }

  equals(other: GroupedBeatmap | null): boolean {
    return other !== null && this.key === other.key;
  }
}

export type CarouselModel = GroupDefinition | GroupedBeatmapSet | GroupedBeatmap;
