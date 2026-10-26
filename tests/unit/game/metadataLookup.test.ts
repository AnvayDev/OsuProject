// BeatmapUpdaterMetadataLookup (BeatmapUpdaterMetadataLookup.cs) and the mirror source's mapping of osu-web JSON (APIBeatmapMetadataSource.cs).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeatmapInfo } from '@game/beatmaps/BeatmapInfo';
import { BeatmapOnlineStatus } from '@game/beatmaps/BeatmapOnlineStatus';
import { BeatmapSetInfo } from '@game/beatmaps/BeatmapSetInfo';
import { BeatmapUpdaterMetadataLookup } from '@game/beatmaps/BeatmapUpdaterMetadataLookup';
import { MirrorBeatmapMetadataSource, type LookupResult } from '@game/beatmaps/MirrorBeatmapMetadataSource';
import type { OnlineBeatmapMetadata } from '@game/beatmaps/OnlineBeatmapMetadata';

const makeSet = (...md5s: string[]) => {
  const set = new BeatmapSetInfo();
  for (const md5 of md5s) {
    const b = new BeatmapInfo();
    b.md5Hash = md5;
    b.beatmapSet = set;
    set.beatmaps.push(b);
  }
  return set;
};

const meta = (md5: string, setId = 10, starRating = 4.5): OnlineBeatmapMetadata => ({
  beatmapID: 100, beatmapSetID: setId, authorID: 7, beatmapStatus: BeatmapOnlineStatus.Ranked, beatmapSetStatus: BeatmapOnlineStatus.Ranked,
  dateRanked: new Date('2020-01-02T00:00:00Z'), dateSubmitted: new Date('2019-05-06T00:00:00Z'), md5Hash: md5, lastUpdated: new Date(),
  userTags: [], starRating,
});

describe('BeatmapUpdaterMetadataLookup', () => {
  it('applies beatmap and set metadata when every beatmap matches one set', async () => {
    const set = makeSet('a', 'b');
    const lookup = new BeatmapUpdaterMetadataLookup({ tryLookup: async b => ({ onlineMetadata: meta(b.md5Hash) }) });

    const stars = await lookup.update(set, true);

    expect(set.beatmaps.map(b => [b.onlineID, b.status])).toEqual([[100, BeatmapOnlineStatus.Ranked], [100, BeatmapOnlineStatus.Ranked]]);
    expect(set.onlineID).toBe(10);
    expect(set.status).toBe(BeatmapOnlineStatus.Ranked);
    expect(set.dateRanked?.toISOString()).toBe('2020-01-02T00:00:00.000Z');
    expect(set.beatmaps[0].metadata.author.onlineID).toBe(7);
    expect([...stars.values()]).toEqual([4.5, 4.5]);
  });

  it('resets a beatmap the source doesn\'t know and leaves the set status', async () => {
    const set = makeSet('a', 'b');
    const lookup = new BeatmapUpdaterMetadataLookup({ tryLookup: async b => ({ onlineMetadata: b.md5Hash === 'a' ? meta('a') : null }) });

    await lookup.update(set, true);

    expect(set.beatmaps[1].onlineID).toBe(-1);
    expect(set.status).toBe(BeatmapOnlineStatus.None);
    expect(set.dateRanked).toBeNull();
  });

  it('keeps everything when the lookup could not be performed', async () => {
    const set = makeSet('a');
    set.beatmaps[0].onlineID = 55;
    const lookup = new BeatmapUpdaterMetadataLookup({ tryLookup: async (): Promise<LookupResult> => null });

    const stars = await lookup.update(set, true);

    expect(set.beatmaps[0].onlineID).toBe(55);
    expect(stars.size).toBe(0);
  });
});

describe('MirrorBeatmapMetadataSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps the mirror\'s beatmap and set JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/md5/'))
        return new Response(JSON.stringify({ id: 2158280, beatmapset_id: 1032103, user_id: 829284, status: 'ranked', checksum: 'bbb6', last_updated: '2019-09-24T02:39:13Z', difficulty_rating: 1.67823 }));
      return new Response(JSON.stringify({ status: 'loved', ranked_date: '2019-10-01T00:00:00Z', submitted_date: '2019-09-01T00:00:00Z' }));
    }));

    const b = new BeatmapInfo();
    b.md5Hash = 'bbb6';
    const res = (await new MirrorBeatmapMetadataSource().tryLookup(b))!.onlineMetadata!;

    expect([res.beatmapID, res.beatmapSetID, res.authorID, res.beatmapStatus, res.beatmapSetStatus, res.starRating])
      .toEqual([2158280, 1032103, 829284, BeatmapOnlineStatus.Ranked, BeatmapOnlineStatus.Loved, 1.67823]);
    expect(res.dateSubmitted?.toISOString()).toBe('2019-09-01T00:00:00.000Z');
  });

  it('reports an unknown beatmap as a performed lookup without a result, and a failure as not performed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect(await new MirrorBeatmapMetadataSource().tryLookup(new BeatmapInfo())).toEqual({ onlineMetadata: null });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    expect(await new MirrorBeatmapMetadataSource().tryLookup(new BeatmapInfo())).toBeNull();
  });
});
