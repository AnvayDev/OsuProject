// Beatmap listing: SearchBeatmapSetsRequest's mapping of osu-web parameters onto the mirror search (docs/spec/assets-formats.md §7), the
// APIBeatmapSet JSON mapping, and the card number/date formatting (Humanizer ToMetric, MediumFormattedDate).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeatmapOnlineStatus } from '@game/beatmaps/BeatmapOnlineStatus';
import { SearchBeatmapSetsRequest } from '@game/online/api/requests/SearchBeatmapSetsRequest';
import { APIBeatmapSet } from '@game/online/api/requests/responses/APIBeatmapSet';
import { SearchCategory } from '@game/overlays/beatmapListing/SearchCategory';
import { SearchExplicit } from '@game/overlays/beatmapListing/SearchExplicit';
import { SearchExtra } from '@game/overlays/beatmapListing/SearchExtra';
import { SearchGeneral } from '@game/overlays/beatmapListing/SearchGeneral';
import { SearchGenre } from '@game/overlays/beatmapListing/SearchGenre';
import { SearchLanguage } from '@game/overlays/beatmapListing/SearchLanguage';
import { SortCriteria } from '@game/overlays/beatmapListing/SortCriteria';
import { SortDirection } from '@game/overlays/SortDirection';
import { RulesetInfo, RulesetStore } from '@game/rulesets/RulesetInfo';
import { toLocalisedMediumDate } from '@game/utils/FormatUtils';
import { toMetric } from '@game/utils/HumanizerUtils';

const params = (r: SearchBeatmapSetsRequest) => Object.fromEntries(new URL(r.uri!).searchParams);

afterEach(() => vi.unstubAllGlobals());

describe('SearchBeatmapSetsRequest', () => {
  it('maps the default listing search', () => {
    const r = new SearchBeatmapSetsRequest('', new RulesetInfo(), null, [SearchGeneral.FeaturedArtists], SearchCategory.Leaderboard);

    expect(params(r)).toEqual({ status: '1,2,3,4', q: '[track_id > 0 AND nsfw = false]', sort: 'ranked_date:desc', amount: '50' });
  });

  it('maps filters, mode, sort direction and the cursor', () => {
    const r = new SearchBeatmapSetsRequest('camellia', RulesetStore.getRuleset(3)!, 100, [SearchGeneral.Spotlights], SearchCategory.Ranked,
      SortCriteria.Plays, SortDirection.Ascending, SearchGenre.Electronic, SearchLanguage.Japanese, [SearchExtra.Video, SearchExtra.Storyboard],
      null, undefined, SearchExplicit.Show);

    expect(params(r)).toEqual({
      mode: '3',
      status: '1,2',
      q: '[spotlight = true AND genre_id = 10 AND language_id = 3 AND video = true AND storyboard = true] camellia',
      sort: 'play_count:asc',
      amount: '50',
      offset: '100',
    });
  });

  it('omits unsortable criteria and the status of the any category', () => {
    const r = new SearchBeatmapSetsRequest('x', new RulesetInfo(), null, null, SearchCategory.Any, SortCriteria.Relevance, SortDirection.Descending,
      SearchGenre.Any, SearchLanguage.Any, null, null, undefined, SearchExplicit.Show);

    expect(params(r)).toEqual({ q: 'x', amount: '50' });
  });

  it('has no results for searches that need a user, without a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    for (const r of [
      new SearchBeatmapSetsRequest('', new RulesetInfo(), null, null, SearchCategory.Favourites),
      new SearchBeatmapSetsRequest('', new RulesetInfo(), null, [SearchGeneral.Follows]),
    ]) {
      expect(r.uri).toBeNull();

      const results: unknown[] = [];
      r.success.add(response => results.push(response));
      await r.perform();
      expect(results).toEqual([{ beatmapSets: [], cursor: null }]);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pages by offset until a short page', async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(page(50)))).mockResolvedValueOnce(new Response(JSON.stringify(page(3))));
    vi.stubGlobal('fetch', fetchMock);

    const cursors: (number | null)[] = [];

    for (const cursor of [null, 50]) {
      const r = new SearchBeatmapSetsRequest('', new RulesetInfo(), cursor);
      r.success.add(response => cursors.push(response.cursor));
      await r.perform();
    }

    expect(cursors).toEqual([50, null]);
  });
});

describe('APIBeatmapSet', () => {
  it('maps osu-web JSON', () => {
    const set = APIBeatmapSet.fromJson({
      id: 2504538, title: 'Medianoche', title_unicode: 'Medianoche', artist: 'ZUTOMAYO', artist_unicode: 'ずっと真夜中でいいのに。', creator: 'Sadd0509',
      user_id: 26829492, covers: { 'card@2x': 'https://assets.ppy.sh/c@2x.jpg', card: 'https://assets.ppy.sh/c.jpg' }, status: 'graveyard',
      play_count: 127, favourite_count: 3, nsfw: false, track_id: null, ranked_date: null, last_updated: '2026-02-07T20:10:28Z',
      beatmaps: [{ id: 5513774, mode_int: 0, difficulty_rating: 5.30016, version: 'Extra', total_length: 227 }],
    });

    expect(set.onlineID).toBe(2504538);
    expect(set.status).toBe(BeatmapOnlineStatus.Graveyard);
    expect(set.author).toMatchObject({ id: 26829492, username: 'Sadd0509' });
    expect(set.covers.card).toBe('https://assets.ppy.sh/c@2x.jpg');
    expect(set.trackId).toBeNull();
    expect(set.lastUpdated?.toISOString()).toBe('2026-02-07T20:10:28.000Z');
    expect(set.beatmaps[0]).toMatchObject({ onlineID: 5513774, rulesetID: 0, starRating: 5.30016, difficultyName: 'Extra', length: 227000 });
  });
});

describe('card formatting', () => {
  it('formats counts like Humanizer ToMetric(decimals: 1)', () => {
    expect([0, 44, 999, 1000, 3864, 12345, 1_250_000, 131_724_612].map(n => toMetric(n, 1))).toEqual(['0', '44', '999', '1k', '3.9k', '12.3k', '1.2M', '131.7M']);
  });

  it('formats dates like moment ll in English', () => {
    expect(toLocalisedMediumDate(new Date('2026-10-19T23:30:00Z'))).toBe('19 Oct 2026');
  });
});
