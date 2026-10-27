// Ported from osu.Game/Screens/Select/FilterCriteria.cs
// Mods and IRulesetFilterCriteria aren't ported (no ruleset instances exist in this port). The local user fields stay null (no online API).

import { BeatmapOnlineStatus } from '../../beatmaps/BeatmapOnlineStatus';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { GroupMode } from './filter/GroupMode';
import { SortMode } from './filter/SortMode';

export enum MatchMode {
  /** Match using a simple "contains" substring match. */
  Substring,

  /** Match for the search phrase being isolated by spaces, or at the start or end of the text. */
  IsolatedPhrase,

  /** Match for the search phrase matching the full text in completion. */
  FullPhrase,
}

export class OptionalSet<T> {
  get hasFilter(): boolean {
    return true;
  }

  isInRange(value: T): boolean {
    return this.values.has(value);
  }

  readonly values: Set<T>;

  constructor(allValues: Iterable<T>) {
    this.values = new Set(allValues);
  }
}

/** (C#'s Comparer<T>.Default: numbers by value, DateTimeOffsets by instant.) */
export class OptionalRange<T extends number | Date> {
  get hasFilter(): boolean {
    return this.max !== null || this.min !== null;
  }

  isInRange(value: T): boolean {
    let lowerRangeSatisfied = true;
    let upperRangeSatisfied = true;

    if (this.min !== null) {
      const comparison = compare(value, this.min);
      lowerRangeSatisfied = comparison > 0 || (comparison === 0 && this.isLowerInclusive);
    }

    if (this.max !== null) {
      const comparison = compare(value, this.max);
      upperRangeSatisfied = comparison < 0 || (comparison === 0 && this.isUpperInclusive);
    }

    let result = lowerRangeSatisfied && upperRangeSatisfied;
    if (this.invertRange)
      result = !result;
    return result;
  }

  min: T | null = null;
  max: T | null = null;
  isLowerInclusive = false;
  isUpperInclusive = false;

  /** When true, the meaning of this filter is inverted, i.e. it will exclude items that satisfy this range. */
  invertRange = false;

  equals(other: OptionalRange<T>): boolean {
    return this.min?.valueOf() === other.min?.valueOf()
      && this.max?.valueOf() === other.max?.valueOf()
      && this.isLowerInclusive === other.isLowerInclusive
      && this.isUpperInclusive === other.isUpperInclusive;
  }
}

function compare(a: number | Date, b: number | Date): number {
  const x = a.valueOf(), y = b.valueOf();
  return x < y ? -1 : x > y ? 1 : 0;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class OptionalTextFilter {
  get hasFilter(): boolean {
    return this._searchTerm.length > 0;
  }

  private _matchMode = MatchMode.Substring;

  get matchMode(): MatchMode {
    return this._matchMode;
  }

  matches(value: string): boolean {
    if (!this.hasFilter)
      return true;

    // search term is guaranteed to be non-empty, so if the string we're comparing is empty, it's not matching
    if (!value)
      return this.excludeTerm;

    let result: boolean;

    switch (this._matchMode) {
      default:
      case MatchMode.Substring:
        // (StringComparison.OrdinalIgnoreCase)
        result = value.toUpperCase().includes(this._searchTerm.toUpperCase());
        break;

      case MatchMode.IsolatedPhrase:
        // (JS \b is ASCII-only where .NET's is Unicode-aware.)
        result = new RegExp(`(^|\\b)${escapeRegex(this._searchTerm)}($|\\b)`, 'i').test(value);
        break;

      case MatchMode.FullPhrase:
        result = value.toUpperCase() === this._searchTerm.toUpperCase();
        break;
    }

    if (this.excludeTerm)
      result = !result;

    return result;
  }

  /** When true, the meaning of this filter is inverted, i.e. it will exclude items which match searchTerm. */
  excludeTerm = false;

  private _searchTerm = '';

  get searchTerm(): string {
    return this._searchTerm;
  }

  set searchTerm(value: string) {
    this._searchTerm = value;

    if (this._searchTerm.startsWith('"')) {
      // length check ensures that the quote character in the `startsWith()` check above and the `endsWith()` check below is not the same character.
      if (this._searchTerm.endsWith('"!') && this._searchTerm.length >= 3) {
        this._searchTerm = trimChars(this._searchTerm.replace(/!+$/, ''), '"');
        this._matchMode = MatchMode.FullPhrase;
      } else {
        this._searchTerm = trimChars(this._searchTerm, '"');
        this._matchMode = MatchMode.IsolatedPhrase;
      }
    } else
      this._matchMode = MatchMode.Substring;
  }

  static of(searchTerm: string): OptionalTextFilter {
    const f = new OptionalTextFilter();
    f.searchTerm = searchTerm;
    return f;
  }

  equals(other: OptionalTextFilter): boolean {
    return this._searchTerm === other._searchTerm;
  }
}

/** string.Trim(char) */
function trimChars(s: string, c: string): string {
  let start = 0, end = s.length;
  while (start < end && s[start] === c) start++;
  while (end > start && s[end - 1] === c) end--;
  return s.slice(start, end);
}

const allOnlineStatuses = Object.values(BeatmapOnlineStatus).filter((v): v is BeatmapOnlineStatus => typeof v === 'number');

export class FilterCriteria {
  group = GroupMode.None;
  sort = SortMode.Artist;

  selectedBeatmapSet: BeatmapSetInfo | null = null;

  starDifficulty = new OptionalRange<number>();
  approachRate = new OptionalRange<number>();
  drainRate = new OptionalRange<number>();
  circleSize = new OptionalRange<number>();
  overallDifficulty = new OptionalRange<number>();
  length = new OptionalRange<number>();
  bpm = new OptionalRange<number>();
  beatDivisor = new OptionalRange<number>();
  onlineStatus = new OptionalSet<BeatmapOnlineStatus>(allOnlineStatuses);
  lastPlayed = new OptionalRange<Date>();
  dateRanked = new OptionalRange<Date>();
  dateSubmitted = new OptionalRange<Date>();
  creator = new OptionalTextFilter();
  artist = new OptionalTextFilter();
  title = new OptionalTextFilter();
  difficultyName = new OptionalTextFilter();
  source = new OptionalTextFilter();
  userTags: OptionalTextFilter[] = [];

  userStarDifficulty = Object.assign(new OptionalRange<number>(), {
    isLowerInclusive: true,
    isUpperInclusive: true,
  });

  searchTerms: OptionalTextFilter[] = [];

  ruleset: RulesetInfo | null = null;
  allowConvertedBeatmaps = false;
  beatmapSetId: number | null = null;

  hasOnlineID: boolean | null = null;

  private _searchText = '';

  private _searchNumber: number | null = null;

  /** searchText as a number (if it can be parsed as one). */
  get searchNumber(): number | null {
    return this._searchNumber;
  }

  get searchText(): string {
    return this._searchText;
  }

  set searchText(value: string) {
    this._searchText = value;

    const terms: OptionalTextFilter[] = [];

    let remainingText = value;

    // Match either an open difficulty tag to the end of string,
    // or match a closed one with a whitespace after it.
    //
    // To keep things simple, the closing ']' may be included in the match group,
    // and is trimmed post-match.
    for (const quotedSegment of value.matchAll(/(^|\s)\[(.*)(\]\s|$)/g)) {
      this.difficultyName = OptionalTextFilter.of(trimChars(quotedSegment[2], ']'));

      remainingText = remainingText.replaceAll(quotedSegment[0], '');
    }

    // First handle quoted segments to ensure we keep inline spaces in exact matches.
    for (const quotedSegment of value.matchAll(/("[^"]+"[!]?)/g)) {
      terms.push(OptionalTextFilter.of(quotedSegment[0]));
      remainingText = remainingText.replaceAll(quotedSegment[0], '');
    }

    // Then handle the rest splitting on any spaces.
    terms.push(...remainingText.split(' ').filter(s => s.length > 0).map(s => OptionalTextFilter.of(s)));

    this.searchTerms = terms;

    this._searchNumber = null;

    if (this.searchTerms.length === 1 && /^\s*[+-]?\d+\s*$/.test(this.searchTerms[0].searchTerm)) {
      const parsed = Number(this.searchTerms[0].searchTerm);
      if (parsed >= -2147483648 && parsed <= 2147483647)
        this._searchNumber = parsed;
    }
  }

  /** Hashes from the BeatmapCollection to filter to. */
  collectionBeatmapMD5Hashes: ReadonlySet<string> | null = null;

  /** The user ID of the current local user, used to filter to own maps when GroupMode.MyMaps is selected. Or null if the user is not logged in. */
  localUserId: number | null = null;

  /** The username of the current local user, used to filter to own maps when GroupMode.MyMaps is selected. Or null if the user is not logged in. */
  localUserUsername: string | null = null;

  /** Given a new filter criteria, decide whether a full sort needs to be performed. */
  requiresSorting(newCriteria: FilterCriteria): boolean {
    if (this.sort !== newCriteria.sort)
      return true;

    switch (this.sort) {
      // Some sorts are stable across all other changes.
      // Running these sorts will sort all items, including currently hidden items.
      case SortMode.Artist:
      case SortMode.Author:
      case SortMode.DateSubmitted:
      case SortMode.DateAdded:
      case SortMode.DateRanked:
      case SortMode.Source:
      case SortMode.Title:
        return false;

      // Some sorts use aggregate max comparisons, which will change based on filtered items.
      // These sorts generally ignore items hidden by filtered state, so we must force a sort under all circumstances here.
      //
      // This makes things very slow when typing a text search, and we probably want to consider a way to optimise things going forward.
      case SortMode.LastPlayed:
      case SortMode.BPM:
      case SortMode.Length:
      case SortMode.Difficulty:
        return true;
    }
  }
}
