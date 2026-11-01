// Ported from osu.Game/Online/API/Requests/SearchBeatmapSetsRequest.cs (with APIRequest's Success/Failure/Cancel) and
// SearchBeatmapSetsResponse.cs.
// Web: the search is the mirror's /api/v2/search; osu-web's parameters are mapped onto it as docs/spec/assets-formats.md §7 describes.
// The mirror has no cursor: the cursor is the offset of the next page, null once a page comes back short.
// With keywords, the mirror (a Meilisearch index) ranks by relevance first and only applies the sort within equally relevant results, where
// osu-web sorts the whole result set. So keyword searches with a sort other than relevance fetch every hit (the index caps keyword searches
// at max_keyword_hits), sort them here, and are paged from that list.

import { Signal } from '@fw/bindables/Signal';
import { Logger, LoggingTarget } from '@fw/logging/Logger';
import { SearchCategory } from '../../../overlays/beatmapListing/SearchCategory';
import { SearchExplicit } from '../../../overlays/beatmapListing/SearchExplicit';
import { SearchExtra } from '../../../overlays/beatmapListing/SearchExtra';
import { SearchGeneral } from '../../../overlays/beatmapListing/SearchGeneral';
import { SearchGenre } from '../../../overlays/beatmapListing/SearchGenre';
import { SearchLanguage } from '../../../overlays/beatmapListing/SearchLanguage';
import { SearchPlayed } from '../../../overlays/beatmapListing/SearchPlayed';
import { SortCriteria } from '../../../overlays/beatmapListing/SortCriteria';
import { SortDirection } from '../../../overlays/SortDirection';
import type { RulesetInfo } from '../../../rulesets/RulesetInfo';
import type { ScoreRank } from '../../../scoring/ScoreRank';
import { MIRROR_ROOT, mirrorFetch } from '../MirrorAccess';
import { APIBeatmapSet } from './responses/APIBeatmapSet';

/** osu-web's search page size. */
const page_size = 50;

/** The mirror's largest page. */
const mirror_page_size = 100;

/** The most hits the mirror returns for a keyword search (Meilisearch's default maxTotalHits). */
const max_keyword_hits = 1000;

/** The last keyword search fetched in full (by its uri without paging), so further pages of it are served from memory. */
let fullResults: { key: string; sets: Promise<unknown[]> } | null = null;

interface MirrorBeatmapSetJson {
  id: number;
  title?: string;
  artist?: string;
  ranked_date?: string | null;
  last_updated?: string | null;
  play_count?: number;
  favourite_count?: number;
  beatmaps?: { difficulty_rating?: number }[];
}

/** The value the mirror sorts by for a sort attribute (difficulty: the easiest beatmap ascending, the hardest descending, as the mirror does). */
function sortValue(set: MirrorBeatmapSetJson, attribute: string, descending: boolean): string | number | null {
  switch (attribute) {
    case 'title': return set.title?.toLowerCase() ?? null;
    case 'artist': return set.artist?.toLowerCase() ?? null;
    case 'last_updated': return set.last_updated ? Date.parse(set.last_updated) : null;
    case 'ranked_date': return set.ranked_date ? Date.parse(set.ranked_date) : null;
    case 'play_count': return set.play_count ?? null;
    case 'favourite_count': return set.favourite_count ?? null;

    case 'beatmaps.difficulty_rating': {
      const ratings = (set.beatmaps ?? []).map(b => b.difficulty_rating ?? 0);
      return ratings.length === 0 ? null : descending ? Math.max(...ratings) : Math.min(...ratings);
    }

    default: return null;
  }
}

/** Sorts mirror results by an attribute (missing values last, ties by newest set). */
function sortSets(sets: MirrorBeatmapSetJson[], attribute: string, descending: boolean): MirrorBeatmapSetJson[] {
  const keyed = sets.map(set => ({ set, value: sortValue(set, attribute, descending) }));

  keyed.sort((a, b) => {
    if (a.value === null || b.value === null)
      return a.value === b.value ? b.set.id - a.set.id : a.value === null ? 1 : -1;

    const c = a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    return c === 0 ? b.set.id - a.set.id : descending ? -c : c;
  });

  return keyed.map(k => k.set);
}

/** (SearchBeatmapSetsResponse) */
export interface SearchBeatmapSetsResponse {
  readonly beatmapSets: APIBeatmapSet[];
  /** The offset of the next page, or null when there are no more results. */
  readonly cursor: number | null;
}

/** SearchCategory → the mirror's status list (null: any status; empty: no results without a user). */
function categoryStatuses(category: SearchCategory): string | null | undefined {
  switch (category) {
    case SearchCategory.Any: return null;
    case SearchCategory.Leaderboard: return '1,2,3,4';
    case SearchCategory.Ranked: return '1,2';
    case SearchCategory.Qualified: return '3';
    case SearchCategory.Loved: return '4';
    case SearchCategory.Pending: return '0';
    case SearchCategory.Wip: return '-1';
    case SearchCategory.Graveyard: return '-2';
    case SearchCategory.Favourites:
    case SearchCategory.Mine:
      return undefined;
  }
}

/** SortCriteria → the mirror's sortable attribute (null: not sortable, the mirror's default order). */
function sortAttribute(criteria: SortCriteria): string | null {
  switch (criteria) {
    case SortCriteria.Title: return 'title';
    case SortCriteria.Artist: return 'artist';
    case SortCriteria.Difficulty: return 'beatmaps.difficulty_rating';
    case SortCriteria.Updated: return 'last_updated';
    case SortCriteria.Ranked: return 'ranked_date';
    case SortCriteria.Plays: return 'play_count';
    case SortCriteria.Favourites: return 'favourite_count';
    case SortCriteria.Rating:
    case SortCriteria.Relevance:
    case SortCriteria.Nominations:
      return null;
  }
}

export class SearchBeatmapSetsRequest {
  readonly success = new Signal<SearchBeatmapSetsResponse>();

  readonly failure = new Signal<Error>();

  private readonly abortController = new AbortController();
  private completed = false;

  constructor(
    private readonly query: string | null,
    private readonly ruleset: RulesetInfo,
    private readonly cursor: number | null = null,
    readonly general: readonly SearchGeneral[] | null = null,
    readonly searchCategory = SearchCategory.Any,
    readonly sortCriteria = SortCriteria.Ranked,
    readonly sortDirection = SortDirection.Descending,
    readonly genre = SearchGenre.Any,
    readonly language = SearchLanguage.Any,
    readonly extra: readonly SearchExtra[] | null = null,
    readonly ranks: readonly ScoreRank[] | null = null,
    readonly played = SearchPlayed.Any,
    readonly explicitContent = SearchExplicit.Hide,
  ) {
  }

  /** The mirror request URL, or null when the search can't have results (it needs a user). */
  get uri(): string | null {
    const params = this.searchParams();

    if (params === null)
      return null;

    params.set('amount', page_size.toString());

    if (this.cursor !== null)
      params.set('offset', this.cursor.toString());

    return `${MIRROR_ROOT}/v2/search?${params}`;
  }

  /** Whether the search has keywords and a sort the mirror only applies within equally relevant results (see the header). */
  private get sortsClientSide(): boolean {
    return !!this.query?.trim() && sortAttribute(this.sortCriteria) !== null;
  }

  /** The search's parameters, without paging. */
  private searchParams(): URLSearchParams | null {
    const params = new URLSearchParams();
    const filters: string[] = [];

    if (this.general?.includes(SearchGeneral.Follows))
      return null;

    if (this.general?.includes(SearchGeneral.Spotlights))
      filters.push('spotlight = true');

    if (this.general?.includes(SearchGeneral.FeaturedArtists))
      filters.push('track_id > 0');

    if (this.ruleset.onlineID >= 0)
      params.set('mode', this.ruleset.onlineID.toString());

    const statuses = categoryStatuses(this.searchCategory);

    if (statuses === undefined)
      return null;

    if (statuses !== null)
      params.set('status', statuses);

    if (this.genre !== SearchGenre.Any)
      filters.push(`genre_id = ${this.genre}`);

    if (this.language !== SearchLanguage.Any)
      filters.push(`language_id = ${this.language}`);

    if (this.extra?.includes(SearchExtra.Video))
      filters.push('video = true');

    if (this.extra?.includes(SearchExtra.Storyboard))
      filters.push('storyboard = true');

    if (this.explicitContent === SearchExplicit.Hide)
      filters.push('nsfw = false');

    const query = this.query ?? '';
    const q = filters.length > 0 ? `[${filters.join(' AND ')}] ${query}`.trim() : query;

    if (q !== '')
      params.set('q', q);

    const sort = sortAttribute(this.sortCriteria);

    if (sort !== null)
      params.set('sort', `${sort}:${this.sortDirection === SortDirection.Descending ? 'desc' : 'asc'}`);

    return params;
  }

  /** Every hit of a keyword search, sorted by the requested attribute. Shared by the search's pages. */
  private fetchAllSorted(params: URLSearchParams): Promise<unknown[]> {
    const key = params.toString();

    if (fullResults?.key === key)
      return fullResults.sets;

    const fetchPage = async (offset: number): Promise<MirrorBeatmapSetJson[]> => {
      const pageParams = new URLSearchParams(params);
      pageParams.set('amount', mirror_page_size.toString());
      pageParams.set('offset', offset.toString());

      const uri = `${MIRROR_ROOT}/v2/search?${pageParams}`;
      Logger.log(`Performing request ${uri}`, LoggingTarget.Network);

      // (not tied to this request's cancellation: later pages of the same search reuse the result)
      const response = await mirrorFetch(uri);
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);

      return await response.json() as MirrorBeatmapSetJson[];
    };

    const sets = (async () => {
      const first = await fetchPage(0);
      let all = first;

      if (first.length === mirror_page_size) {
        const offsets: number[] = [];
        for (let offset = mirror_page_size; offset < max_keyword_hits; offset += mirror_page_size)
          offsets.push(offset);

        const pages = await Promise.all(offsets.map(fetchPage));
        all = [first, ...pages].flat();
      }

      const attribute = sortAttribute(this.sortCriteria)!;
      return sortSets(all, attribute, this.sortDirection === SortDirection.Descending);
    })();

    fullResults = { key, sets };
    // a failed fetch isn't kept, so the search can be retried.
    sets.catch(() => {
      if (fullResults?.sets === sets)
        fullResults = null;
    });

    return sets;
  }

  /** (APIAccess.Queue → Perform) */
  async perform(): Promise<void> {
    const uri = this.uri;
    const offset = this.cursor ?? 0;

    try {
      let beatmapSets: APIBeatmapSet[] = [];

      if (uri !== null && this.sortsClientSide) {
        const all = await this.fetchAllSorted(this.searchParams()!);
        this.abortController.signal.throwIfAborted();

        beatmapSets = all.slice(offset, offset + page_size).map(s => APIBeatmapSet.fromJson(s));
      } else if (uri !== null) {
        Logger.log(`Performing request ${uri}`, LoggingTarget.Network);

        const response = await mirrorFetch(uri, () => ({ signal: this.abortController.signal }));

        if (!response.ok)
          throw new Error(`${response.status} ${response.statusText}`);

        beatmapSets = (await response.json() as unknown[]).map(s => APIBeatmapSet.fromJson(s));
      }

      if (this.completed) return;
      this.completed = true;

      this.success.emit({ beatmapSets, cursor: beatmapSets.length < page_size ? null : offset + beatmapSets.length });
    } catch (e) {
      if (this.completed) return;
      this.completed = true;

      Logger.log(`Failing request ${uri} (${e})`, LoggingTarget.Network);
      this.failure.emit(e instanceof Error ? e : new Error(String(e)));
    }
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;

    this.abortController.abort();
  }
}
