// Ported from osu.Game/Screens/Select/BeatmapCarouselFilterSorting.cs

import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import type { CancellationToken, CarouselItem, ICarouselFilter } from '../../graphics/carousel/CarouselItem';
import { OrdinalSortByCaseStringComparer } from '../../utils/OrdinalSortByCaseStringComparer';
import { BeatmapCarouselFilterGrouping } from './BeatmapCarouselFilterGrouping';
import { SortMode } from './filter/SortMode';
import type { FilterCriteria } from './FilterCriteria';

const compareValues = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);

/** Nullable.Compare: null sorts before any value. */
const compareNullable = (a: Date | null, b: Date | null): number =>
  a === null ? (b === null ? 0 : -1) : b === null ? 1 : compareValues(a.getTime(), b.getTime());

// (Guid.CompareTo orders by the same fields, in the same order, as the lowercase hex string form.)
const compareGuid = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export class BeatmapCarouselFilterSorting implements ICarouselFilter {
  private _beatmapItemsCount = 0;

  get beatmapItemsCount(): number {
    return this._beatmapItemsCount;
  }

  private readonly getCriteria: () => FilterCriteria;

  constructor(getCriteria: () => FilterCriteria) {
    this.getCriteria = getCriteria;
  }

  async run(items: CarouselItem[], _cancellationToken: CancellationToken): Promise<CarouselItem[]> {
    const criteria = this.getCriteria();

    const groupedSets = BeatmapCarouselFilterGrouping.shouldGroupBeatmapsTogether(criteria);

    this._beatmapItemsCount = items.length;

    // (Array.prototype.sort is stable, as LINQ's Order.)
    return [...items].sort((a, b) => {
      const ab = a.model as BeatmapInfo;
      const bb = b.model as BeatmapInfo;

      if (groupedSets) {
        if (ab.beatmapSet!.equals(bb.beatmapSet))
          return BeatmapCarouselFilterSorting.compareDifficulty(ab, bb, criteria.sort);

        // If we're grouping by sets, all fallback sorts need to be aggregates for the set.
        return BeatmapCarouselFilterSorting.compare(ab, bb, criteria.sort, true);
      }

      return BeatmapCarouselFilterSorting.compare(ab, bb, criteria.sort, false);
    });
  }

  private static compare(a: BeatmapInfo, b: BeatmapInfo, sort: SortMode, aggregate: boolean): number {
    let comparison: number;

    switch (sort) {
      case SortMode.Artist:
        comparison = OrdinalSortByCaseStringComparer.compare(a.beatmapSet!.metadata.artist, b.beatmapSet!.metadata.artist);
        if (comparison === 0)
          comparison = OrdinalSortByCaseStringComparer.compare(a.beatmapSet!.metadata.title, b.beatmapSet!.metadata.title);
        break;

      case SortMode.Title:
        comparison = OrdinalSortByCaseStringComparer.compare(a.beatmapSet!.metadata.title, b.beatmapSet!.metadata.title);
        break;

      case SortMode.Author:
        comparison = OrdinalSortByCaseStringComparer.compare(a.beatmapSet!.metadata.author.username, b.beatmapSet!.metadata.author.username);
        break;

      case SortMode.Source:
        comparison = OrdinalSortByCaseStringComparer.compare(a.beatmapSet!.metadata.source, b.beatmapSet!.metadata.source);
        break;

      case SortMode.Difficulty:
        comparison = compareValues(a.starRating, b.starRating);
        break;

      case SortMode.DateAdded:
        comparison = compareValues(b.beatmapSet!.dateAdded.getTime(), a.beatmapSet!.dateAdded.getTime());
        break;

      case SortMode.DateRanked:
        comparison = compareNullable(b.beatmapSet!.dateRanked, a.beatmapSet!.dateRanked);
        break;

      case SortMode.DateSubmitted:
        comparison = compareNullable(b.beatmapSet!.dateSubmitted, a.beatmapSet!.dateSubmitted);
        break;

      case SortMode.LastPlayed:
        if (aggregate)
          // ((DateTimeOffset.MinValue).ToUnixTimeSeconds())
          comparison = BeatmapCarouselFilterSorting.compareUsingAggregateMax(b, a, bm => Math.floor((bm.lastPlayed?.getTime() ?? -62135596800000) / 1000));
        else
          comparison = compareNullable(b.lastPlayed, a.lastPlayed);
        break;

      case SortMode.BPM:
        if (aggregate)
          comparison = BeatmapCarouselFilterSorting.compareUsingAggregateMax(a, b, bm => bm.bpm);
        else
          comparison = compareValues(a.bpm, b.bpm);
        break;

      case SortMode.Length:
        if (aggregate)
          comparison = BeatmapCarouselFilterSorting.compareUsingAggregateMax(a, b, bm => bm.length);
        else
          comparison = compareValues(a.length, b.length);
        break;
    }

    // If the initial sort could not differentiate, attempt to use Title then DateAdded to order sets in a stable fashion.
    if (comparison === 0)
      comparison = OrdinalSortByCaseStringComparer.compare(a.beatmapSet!.metadata.title, b.beatmapSet!.metadata.title);

    // The directionality of this matches the current SortMode.DateAdded, but we may want to reconsider if that becomes a user decision (ie. asc / desc).
    if (comparison === 0)
      comparison = compareValues(b.beatmapSet!.dateAdded.getTime(), a.beatmapSet!.dateAdded.getTime());

    // If both failed to break the tie, fallback to our internal GUID for stability.
    // This basically means it's a stable random sort.
    if (comparison === 0)
      comparison = compareGuid(b.beatmapSet!.id, a.beatmapSet!.id);

    return comparison;
  }

  private static compareDifficulty(a: BeatmapInfo, b: BeatmapInfo, _sort: SortMode): number {
    let comparison = a.ruleset.compareTo(b.ruleset);

    if (comparison === 0)
      comparison = compareValues(a.starRating, b.starRating);

    return comparison;
  }

  private static compareUsingAggregateMax(a: BeatmapInfo, b: BeatmapInfo, func: (b: BeatmapInfo) => number): number {
    const aMatchedBeatmaps = a.beatmapSet!.beatmaps.filter(bb => !bb.hidden);
    const bMatchedBeatmaps = b.beatmapSet!.beatmaps.filter(bb => !bb.hidden);

    const aAny = aMatchedBeatmaps.length > 0;
    const bAny = bMatchedBeatmaps.length > 0;

    if (!aAny && !bAny) return 0;
    if (!aAny) return -1;
    if (!bAny) return 1;

    return compareValues(Math.max(...aMatchedBeatmaps.map(func)), Math.max(...bMatchedBeatmaps.map(func)));
  }
}
