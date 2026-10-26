// Ported from osu.Game/Screens/Select/BeatmapCarouselFilterGrouping.cs
// Offline port: there are no local scores (rank grouping puts everything in "Unplayed", so RankDisplayGroupDefinition is never made), no
// collections or favourites (the getters return nothing) and no ruleset instances (Variant grouping falls back to None, as C# does when the
// ruleset has a single variant). Maps keyed by C# records are keyed by the models' `key` strings (see GroupDefinition.ts).

import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import { BeatmapOnlineStatus } from '../../beatmaps/BeatmapOnlineStatus';
import { type CancellationToken, CarouselItem, type ICarouselFilter } from '../../graphics/carousel/CarouselItem';
import { roundBPM } from '../../utils/FormatUtils';
import { GroupMode } from './filter/GroupMode';
import type { FilterCriteria } from './FilterCriteria';
import { GroupDefinition, GroupedBeatmap, GroupedBeatmapSet, RankedStatusGroupDefinition, StarDifficultyGroupDefinition } from './GroupDefinition';
import { SortMode } from './filter/SortMode';
import { PanelBeatmap } from './PanelBeatmap';
import { PanelBeatmapSet } from './PanelBeatmapSet';
import { PanelBeatmapStandalone } from './PanelBeatmapStandalone';
import { PanelGroup } from './PanelGroup';

/** The parts of a BeatmapCollection used for grouping. */
export interface BeatmapCollection {
  readonly name: string;
  readonly beatmapMD5Hashes: readonly string[];
}

interface GroupMapping {
  readonly group: GroupDefinition | null;
  readonly itemsInGroup: CarouselItem[];
}

const int_min = -2147483648;
const int_max = 2147483647;

const plural = (quantity: number, singular: string, pluralForm: string) => (quantity === 1 ? singular : pluralForm).replace('{0}', `${quantity}`);

export class BeatmapCarouselFilterGrouping implements ICarouselFilter {
  private _beatmapSetsGroupedTogether = false;

  get beatmapSetsGroupedTogether(): boolean {
    return this._beatmapSetsGroupedTogether;
  }

  private _beatmapItemsCount = 0;

  /** The total number of beatmap difficulties displayed post filter. */
  get beatmapItemsCount(): number {
    return this._beatmapItemsCount;
  }

  get itemMap(): ReadonlyMap<string, { item: CarouselItem; index: number }> {
    return this._itemMap;
  }

  /** Beatmap sets contain difficulties as related panels. This map holds the relationships between set-difficulties to allow expanding them on selection. */
  get setItems(): ReadonlyMap<string, { set: GroupedBeatmapSet; items: Set<CarouselItem> }> {
    return this.setMap;
  }

  /** Groups contain children which are group-selectable. This map holds the relationships between groups-panels to allow expanding them on selection. */
  get groupItems(): ReadonlyMap<string, Set<CarouselItem>> {
    return this.groupMap;
  }

  private _itemMap = new Map<string, { item: CarouselItem; index: number }>();
  private setMap = new Map<string, { set: GroupedBeatmapSet; items: Set<CarouselItem> }>();
  private groupMap = new Map<string, Set<CarouselItem>>();

  getCriteria!: () => FilterCriteria;
  getCollections: () => BeatmapCollection[] = () => [];
  getFavouriteBeatmapSets: () => Set<number> = () => new Set();

  constructor(init: { getCriteria: () => FilterCriteria; getCollections?: () => BeatmapCollection[]; getFavouriteBeatmapSets?: () => Set<number> }) {
    Object.assign(this, init);
  }

  async run(items: CarouselItem[], cancellationToken: CancellationToken): Promise<CarouselItem[]> {
    const newItemMap = new Map<string, { item: CarouselItem; index: number }>();
    const newSetMap = new Map<string, { set: GroupedBeatmapSet; items: Set<CarouselItem> }>();
    const newGroupMap = new Map<string, Set<CarouselItem>>();

    const criteria = this.getCriteria();
    const newItems: CarouselItem[] = [];

    this._beatmapSetsGroupedTogether = BeatmapCarouselFilterGrouping.shouldGroupBeatmapsTogether(criteria);

    const groups = this.getGroups(items, criteria);
    let displayedBeatmapsCount = 0;

    for (const { group, itemsInGroup } of groups) {
      // (ThrowIfCancellationRequested: the carousel discards the result of a cancelled filter.)
      if (cancellationToken.isCancellationRequested)
        return [];

      let groupItem: CarouselItem | null = null;
      let currentGroupItems: Set<CarouselItem> | null = null;
      let currentSetItems: Set<CarouselItem> | null = null;
      let lastBeatmap: BeatmapInfo | null = null;

      const addItem = (i: CarouselItem) => {
        newItems.push(i);

        newItemMap.set((i.model as GroupDefinition | GroupedBeatmapSet | GroupedBeatmap).key, { item: i, index: newItems.length - 1 });
        currentGroupItems?.add(i);
        currentSetItems?.add(i);

        i.isVisible = i.model instanceof GroupDefinition || (group === null && (i.model instanceof GroupedBeatmapSet || !this._beatmapSetsGroupedTogether));
      };

      if (group !== null) {
        newGroupMap.set(group.key, currentGroupItems = new Set());

        addItem(groupItem = Object.assign(new CarouselItem(group), {
          drawHeight: PanelGroup.HEIGHT,
          depthLayer: -2,
        }));
      }

      for (const item of itemsInGroup) {
        const beatmap = item.model as BeatmapInfo;

        const newBeatmapSet = lastBeatmap?.beatmapSet!.id !== beatmap.beatmapSet!.id;
        const groupedBeatmapSet = new GroupedBeatmapSet(group, beatmap.beatmapSet!);

        if (newBeatmapSet) {
          let existing = newSetMap.get(groupedBeatmapSet.key);
          if (existing === undefined)
            newSetMap.set(groupedBeatmapSet.key, existing = { set: groupedBeatmapSet, items: new Set() });
          currentSetItems = existing.items;
        }

        if (this._beatmapSetsGroupedTogether) {
          if (newBeatmapSet) {
            if (groupItem !== null)
              groupItem.nestedItemCount++;

            addItem(Object.assign(new CarouselItem(groupedBeatmapSet), {
              drawHeight: PanelBeatmapSet.HEIGHT,
              depthLayer: -1,
            }));
          }
        } else {
          if (groupItem !== null)
            groupItem.nestedItemCount++;
        }

        addItem(Object.assign(new CarouselItem(new GroupedBeatmap(group, beatmap)), {
          drawHeight: this._beatmapSetsGroupedTogether ? PanelBeatmap.HEIGHT : PanelBeatmapStandalone.HEIGHT,
        }));
        lastBeatmap = beatmap;
        displayedBeatmapsCount++;
      }
    }

    if (cancellationToken.isCancellationRequested)
      return [];

    this._itemMap = newItemMap;
    this.setMap = newSetMap;
    this.groupMap = newGroupMap;
    this._beatmapItemsCount = displayedBeatmapsCount;
    return newItems;
  }

  static shouldGroupBeatmapsTogether(criteria: FilterCriteria): boolean {
    // In certain cases, we intentionally split out difficulties
    // where it's more relevant or convenient to view them as individual items.
    if (criteria.sort === SortMode.Difficulty || criteria.group === GroupMode.Difficulty)
      return false;
    if (criteria.sort === SortMode.LastPlayed && criteria.group === GroupMode.LastPlayed)
      return false;
    if (criteria.group === GroupMode.RankAchieved)
      return false;

    // In the majority case we group sets together for display.
    return true;
  }

  private getGroups(items: CarouselItem[], criteria: FilterCriteria): GroupMapping[] {
    switch (criteria.group) {
      case GroupMode.None:
      case GroupMode.Variant:
        return [{ group: null, itemsInGroup: items }];

      case GroupMode.Artist:
        return this.getGroupsBy(b => this.defineGroupAlphabetically(b.beatmapSet!.metadata.artist), items);

      case GroupMode.Author:
        return this.getGroupsBy(b => this.defineGroupAlphabetically(b.beatmapSet!.metadata.author.username), items);

      case GroupMode.Title:
        return this.getGroupsBy(b => this.defineGroupAlphabetically(b.beatmapSet!.metadata.title), items);

      case GroupMode.DateAdded:
        return this.getGroupsBy(b => this.defineGroupByDate(b.beatmapSet!.dateAdded), items);

      case GroupMode.DateRanked:
        return this.getGroupsBy(b => this.defineGroupByRankedDate(b.beatmapSet!.dateRanked), items);

      case GroupMode.LastPlayed:
        return this.getGroupsBy(b => {
          const date = b.lastPlayed;

          if (date === null)
            return [new GroupDefinition(int_max, 'Never')];

          return this.defineGroupByDate(date);
        }, items);

      case GroupMode.RankedStatus:
        return this.getGroupsBy(b => this.defineGroupByStatus(b.beatmapSet!.status), items);

      case GroupMode.BPM:
        return this.getGroupsBy(b => this.defineGroupByBPM(roundBPM(b.bpm)), items);

      case GroupMode.Difficulty:
        return this.getGroupsBy(b => this.defineGroupByStars(b.starRating), items);

      case GroupMode.Length:
        return this.getGroupsBy(b => this.defineGroupByLength(b.length), items);

      case GroupMode.Source:
        return this.getGroupsBy(b => this.defineGroupBySource(b.beatmapSet!.metadata.source), items);

      case GroupMode.Collections:
        return this.defineGroupsByCollection(items, this.getCollections());

      case GroupMode.MyMaps:
        return this.getGroupsBy(b => this.defineGroupByOwnMaps(b, criteria.localUserId, criteria.localUserUsername), items);

      case GroupMode.RankAchieved:
        return this.getGroupsBy(() => [new GroupDefinition(int_max, 'Unplayed')], items);

      case GroupMode.Favourites: {
        const favouriteBeatmapSets = this.getFavouriteBeatmapSets();
        return this.getGroupsBy(b => this.defineGroupByFavourites(b, favouriteBeatmapSets), items);
      }
    }
  }

  private getGroupsBy(defineGroups: (b: BeatmapInfo) => GroupDefinition[], items: CarouselItem[]): GroupMapping[] {
    const groups = new Map<string, GroupMapping>();

    for (const item of items) {
      for (const groupDefinition of defineGroups(item.model as BeatmapInfo)) {
        let group = groups.get(groupDefinition.key);
        if (group === undefined)
          groups.set(groupDefinition.key, group = { group: groupDefinition, itemsInGroup: [] });

        group.itemsInGroup.push(item);
      }
    }

    // (OrderBy(Order).ThenBy(Title): stable, with the default string comparer, which is culture-sensitive.)
    return [...groups.values()].sort((a, b) => a.group!.order - b.group!.order || a.group!.title.localeCompare(b.group!.title));
  }

  private defineGroupAlphabetically(name: string): GroupDefinition[] {
    const firstChar = name.length > 0 ? name[0] : '\0';

    if (firstChar >= '0' && firstChar <= '9')
      return [new GroupDefinition(int_min, '0-9')];

    if (/[A-Za-z]/.test(firstChar))
      return [new GroupDefinition(firstChar.toUpperCase().charCodeAt(0) - 65, firstChar.toUpperCase())];

    return [new GroupDefinition(int_max, 'Other')];
  }

  private defineGroupByDate(date: Date): GroupDefinition[] {
    const totalDays = (Date.now() - date.getTime()) / 86400000;

    if (totalDays < 1)
      return [new GroupDefinition(0, 'Today')];

    if (totalDays < 2)
      return [new GroupDefinition(1, 'Yesterday')];

    if (totalDays < 7)
      return [new GroupDefinition(2, 'Last week')];

    if (totalDays < 30)
      return [new GroupDefinition(3, 'Last month')];

    for (let i = 60; i <= 150; i += 30) {
      if (totalDays < i)
        return [new GroupDefinition(i, plural(i / 30 - 1, '{0} month ago', '{0} months ago'))];
    }

    return [new GroupDefinition(151, plural(5, 'Over {0} month ago', 'Over {0} months ago'))];
  }

  private defineGroupByRankedDate(date: Date | null): GroupDefinition[] {
    if (date === null)
      return [new GroupDefinition(0, 'Unranked')];

    // (DateTimeOffset.Year of a UTC-offset date)
    return [new GroupDefinition(-date.getUTCFullYear(), `${date.getUTCFullYear()}`)];
  }

  private defineGroupByStatus(status: BeatmapOnlineStatus): GroupDefinition[] {
    switch (status) {
      case BeatmapOnlineStatus.Ranked:
      case BeatmapOnlineStatus.Approved:
        return [new RankedStatusGroupDefinition(0, BeatmapOnlineStatus.Ranked)];

      case BeatmapOnlineStatus.Qualified:
        return [new RankedStatusGroupDefinition(1, status)];

      case BeatmapOnlineStatus.WIP:
        return [new RankedStatusGroupDefinition(2, status)];

      case BeatmapOnlineStatus.Pending:
        return [new RankedStatusGroupDefinition(3, status)];

      case BeatmapOnlineStatus.Graveyard:
        return [new RankedStatusGroupDefinition(4, status)];

      case BeatmapOnlineStatus.LocallyModified:
        return [new RankedStatusGroupDefinition(5, status)];

      case BeatmapOnlineStatus.None:
        return [new RankedStatusGroupDefinition(6, status)];

      case BeatmapOnlineStatus.Loved:
        return [new RankedStatusGroupDefinition(7, status)];
    }
  }

  private defineGroupByBPM(bpm: number): GroupDefinition[] {
    if (bpm < 60)
      return [new GroupDefinition(60, 'Under 60 BPM')];

    for (let i = 70; i <= 300; i += 10) {
      if (bpm < i)
        return [new GroupDefinition(i, `${i - 10} - ${i} BPM`)];
    }

    return [new GroupDefinition(301, 'Over 300 BPM')];
  }

  private defineGroupByStars(stars: number): GroupDefinition[] {
    // truncation is intentional - compare `FormatUtils.FormatStarRating()`
    const starInt = Math.trunc(stars);
    const starDifficulty = { stars: starInt, maxCombo: 0 };

    if (starInt === 0)
      return [new StarDifficultyGroupDefinition(0, plural(1, 'Below {0} star', 'Below {0} stars'), starDifficulty)];

    if (starInt < 15)
      return [new StarDifficultyGroupDefinition(starInt, plural(starInt, '{0} star', '{0} stars'), starDifficulty)];

    return [new StarDifficultyGroupDefinition(15, plural(15, 'Over {0} star', 'Over {0} stars'), { stars: 15, maxCombo: 0 })];
  }

  private defineGroupByLength(length: number): GroupDefinition[] {
    for (let i = 1; i < 6; i++) {
      if (length <= i * 60_000)
        return [new GroupDefinition(i, plural(i, '{0} minute or less', '{0} minutes or less'))];
    }

    if (length <= 10 * 60_000)
      return [new GroupDefinition(10, plural(10, '{0} minute or less', '{0} minutes or less'))];

    return [new GroupDefinition(11, plural(10, 'Over {0} minute', 'Over {0} minutes'))];
  }

  private defineGroupBySource(source: string): GroupDefinition[] {
    if (!source)
      return [new GroupDefinition(1, 'Unsourced')];

    return [new GroupDefinition(0, source)];
  }

  private defineGroupsByCollection(carouselItems: CarouselItem[], allCollections: BeatmapCollection[]): GroupMapping[] {
    const groupMappings = new Map<string, GroupMapping>();
    // this is a pre-built mapping of MD5s to a list of collections in which this MD5 is found in.
    // the reason to pre-build this is that `BeatmapCollection.BeatmapMD5Hashes` is a list and therefore a naive implementation would be slow,
    // particularly in edge cases where most beatmaps are in more than one collection.
    const md5ToCollectionsMap = new Map<string, GroupDefinition[]>();

    for (let i = 0; i < allCollections.length; i++) {
      const collection = allCollections[i];
      // NOTE: the ordering of the incoming collection list is significant and needs to be preserved.
      // the fallback to ordering by name cannot be relied on.
      const groupDefinition = new GroupDefinition(i, collection.name);
      groupMappings.set(groupDefinition.key, { group: groupDefinition, itemsInGroup: [] });

      for (const md5 of collection.beatmapMD5Hashes) {
        let collections = md5ToCollectionsMap.get(md5);
        if (collections === undefined)
          md5ToCollectionsMap.set(md5, collections = []);

        collections.push(groupDefinition);
      }
    }

    const notInCollection = new GroupDefinition(int_max, 'Not in collection');
    groupMappings.set(notInCollection.key, { group: notInCollection, itemsInGroup: [] });

    for (const item of carouselItems) {
      const beatmap = item.model as BeatmapInfo;

      if (!beatmap.md5Hash)
        continue;

      const collections = md5ToCollectionsMap.get(beatmap.md5Hash);

      if (collections !== undefined) {
        for (const collection of collections)
          groupMappings.get(collection.key)!.itemsInGroup.push(item);
      } else
        groupMappings.get(notInCollection.key)!.itemsInGroup.push(item);
    }

    return [...groupMappings.values()]
      // safety against potentially empty eagerly-initialised groups
      // (could happen if user has a collection with MD5s of maps that aren't locally available)
      .filter(mapping => mapping.itemsInGroup.length > 0)
      .sort((a, b) => a.group!.order - b.group!.order);
  }

  private defineGroupByOwnMaps(beatmap: BeatmapInfo, localUserId: number | null, localUserUsername: string | null): GroupDefinition[] {
    const author = beatmap.beatmapSet!.metadata.author;

    if (author.onlineID === localUserId || (author.onlineID <= 1 && author.username === localUserUsername))
      return [new GroupDefinition(0, 'My maps')];

    // discard beatmaps not owned by the user.
    return [];
  }

  private defineGroupByFavourites(beatmap: BeatmapInfo, favouriteBeatmapSets: Set<number>): GroupDefinition[] {
    const onlineID = beatmap.beatmapSet?.onlineID ?? 0;

    if (onlineID > 0 && favouriteBeatmapSets.has(onlineID))
      return [new GroupDefinition(0, 'Favourites')];

    return [];
  }
}
