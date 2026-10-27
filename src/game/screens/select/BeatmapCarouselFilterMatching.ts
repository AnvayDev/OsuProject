// Ported from osu.Game/Screens/Select/BeatmapCarouselFilterMatching.cs
// (Runs inline rather than on a thread pool task; the filter is still awaited by the carousel.)

import { allowGameplayWithRuleset, match as matchTerms } from '../../beatmaps/BeatmapInfoExtensions';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import type { CancellationToken, CarouselItem, ICarouselFilter } from '../../graphics/carousel/CarouselItem';
import { floorToDecimalDigits } from '../../utils/FormatUtils';
import type { FilterCriteria } from './FilterCriteria';

export class BeatmapCarouselFilterMatching implements ICarouselFilter {
  private readonly getCriteria: () => FilterCriteria;

  private _beatmapItemsCount = 0;

  get beatmapItemsCount(): number {
    return this._beatmapItemsCount;
  }

  constructor(getCriteria: () => FilterCriteria) {
    this.getCriteria = getCriteria;
  }

  async run(items: CarouselItem[], _cancellationToken: CancellationToken): Promise<CarouselItem[]> {
    const criteria = this.getCriteria();

    return this.matchItems(items, criteria);
  }

  private matchItems(items: readonly CarouselItem[], criteria: FilterCriteria): CarouselItem[] {
    let countMatching = 0;
    const result: CarouselItem[] = [];

    for (const item of items) {
      const beatmap = item.model as BeatmapInfo;

      if (beatmap.hidden)
        continue;

      if (!BeatmapCarouselFilterMatching.checkCriteriaMatch(beatmap, criteria))
        continue;

      countMatching++;
      result.push(item);
    }

    this._beatmapItemsCount = countMatching;
    return result;
  }

  static checkCriteriaMatch(beatmap: BeatmapInfo, criteria: FilterCriteria): boolean {
    let match = criteria.ruleset === null || allowGameplayWithRuleset(beatmap, criteria.ruleset, criteria.allowConvertedBeatmaps);

    if (criteria.selectedBeatmapSet !== null) {
      // only check ruleset equality or convertability for selected beatmap
      return beatmap.beatmapSet?.equals(criteria.selectedBeatmapSet) === true && match;
    }

    if (!match) return false;

    if (criteria.searchTerms.length > 0) {
      match = matchTerms(beatmap, criteria.searchTerms);

      // if a match wasn't found via text matching of terms, do a second catch-all check matching against online IDs.
      // this should be done after text matching so we can prioritise matching numbers in metadata.
      if (!match && criteria.searchNumber !== null) {
        match = (beatmap.onlineID === criteria.searchNumber)
          || (beatmap.beatmapSet?.onlineID === criteria.searchNumber);
      }
    }

    if (!match) return false;

    match &&= !criteria.starDifficulty.hasFilter || criteria.starDifficulty.isInRange(floorToDecimalDigits(beatmap.starRating, 2));
    match &&= !criteria.approachRate.hasFilter || criteria.approachRate.isInRange(beatmap.difficulty.approachRate);
    match &&= !criteria.drainRate.hasFilter || criteria.drainRate.isInRange(beatmap.difficulty.drainRate);
    match &&= !criteria.circleSize.hasFilter || criteria.circleSize.isInRange(beatmap.difficulty.circleSize);
    match &&= !criteria.overallDifficulty.hasFilter || criteria.overallDifficulty.isInRange(beatmap.difficulty.overallDifficulty);
    match &&= !criteria.length.hasFilter || criteria.length.isInRange(beatmap.length);
    // (DateTimeOffset.MinValue)
    match &&= !criteria.lastPlayed.hasFilter || criteria.lastPlayed.isInRange(beatmap.lastPlayed ?? new Date(-62135596800000));
    match &&= !criteria.dateRanked.hasFilter || (beatmap.beatmapSet?.dateRanked != null && criteria.dateRanked.isInRange(beatmap.beatmapSet.dateRanked));
    match &&= !criteria.dateSubmitted.hasFilter || (beatmap.beatmapSet?.dateSubmitted != null && criteria.dateSubmitted.isInRange(beatmap.beatmapSet.dateSubmitted));
    match &&= !criteria.bpm.hasFilter || criteria.bpm.isInRange(beatmap.bpm);

    match &&= !criteria.beatDivisor.hasFilter || criteria.beatDivisor.isInRange(beatmap.beatDivisor);
    match &&= !criteria.onlineStatus.hasFilter || criteria.onlineStatus.isInRange(beatmap.status);

    if (!match) return false;

    match &&= !criteria.creator.hasFilter || criteria.creator.matches(beatmap.metadata.author.username);

    if (criteria.artist.hasFilter) {
      if (criteria.artist.excludeTerm)
        match &&= criteria.artist.matches(beatmap.metadata.artist) && criteria.artist.matches(beatmap.metadata.artistUnicode);
      else
        match &&= criteria.artist.matches(beatmap.metadata.artist) || criteria.artist.matches(beatmap.metadata.artistUnicode);
    }

    if (criteria.title.hasFilter) {
      if (criteria.title.excludeTerm)
        match &&= criteria.title.matches(beatmap.metadata.title) && criteria.title.matches(beatmap.metadata.titleUnicode);
      else
        match &&= criteria.title.matches(beatmap.metadata.title) || criteria.title.matches(beatmap.metadata.titleUnicode);
    }

    match &&= !criteria.difficultyName.hasFilter || criteria.difficultyName.matches(beatmap.difficultyName);
    match &&= !criteria.source.hasFilter || criteria.source.matches(beatmap.metadata.source);

    if (criteria.userTags.length > 0) {
      for (const tagFilter of criteria.userTags) {
        if (tagFilter.excludeTerm) {
          // if `excludeTerm` is true, `matches()` will return true if a user tag *doesn't match* the excluded term.
          // thus, every user tag must pass this filter.
          for (const tag of beatmap.metadata.userTags)
            match &&= tagFilter.matches(tag);
        } else {
          // if `excludeTerm` is false, `matches()` will return true if a user tag *matches* the expected term.
          // the expected behaviour is that a beatmap should be displayed if at least one of the user tags passes the filter.
          let anyTagMatched = false;

          for (const tag of beatmap.metadata.userTags)
            anyTagMatched ||= tagFilter.matches(tag);

          match &&= anyTagMatched;
        }
      }
    }

    match &&= !criteria.userStarDifficulty.hasFilter || criteria.userStarDifficulty.isInRange(beatmap.starRating);

    if (!match) return false;

    match &&= criteria.collectionBeatmapMD5Hashes?.has(beatmap.md5Hash) ?? true;

    if (match && criteria.hasOnlineID === true)
      match &&= beatmap.onlineID >= 0;

    if (match && criteria.beatmapSetId !== null)
      match &&= criteria.beatmapSetId === beatmap.beatmapSet?.onlineID;

    return match;
  }
}
