// Ported (in part) from osu.Game.Tests/NonVisual/Filtering/FilterQueryParserTest.cs
import { describe, expect, it } from 'vitest';
import { BeatmapOnlineStatus } from '@game/beatmaps/BeatmapOnlineStatus';
import { FilterCriteria, MatchMode } from '@game/screens/select/FilterCriteria';
import { applyQueries } from '@game/screens/select/FilterQueryParser';

const parse = (query: string) => {
  const c = new FilterCriteria();
  applyQueries(c, query);
  return c;
};

describe('FilterQueryParser', () => {
  it('bare words', () => {
    const c = parse('looking for a beatmap');
    expect(c.searchText).toBe('looking for a beatmap');
    expect(c.searchTerms.length).toBe(4);
  });

  it('bare words with exact match', () => {
    const c = parse('looking for "a beatmap"! like "this"');
    expect(c.searchTerms.map(t => [t.searchTerm, t.matchMode])).toEqual([
      ['a beatmap', MatchMode.FullPhrase],
      ['this', MatchMode.IsolatedPhrase],
      ['looking', MatchMode.Substring],
      ['for', MatchMode.Substring],
      ['like', MatchMode.Substring],
    ]);
  });

  it('broken full phrase query', () => {
    const c = parse('"!');
    expect(c.searchTerms.length).toBe(1);
    expect(c.searchTerms[0].searchTerm).toBe('!');
    expect(c.searchTerms[0].matchMode).toBe(MatchMode.IsolatedPhrase);
  });

  it.each(['star', 'stars'])('%s queries', variant => {
    const c = parse(`${variant}<4 easy`);
    expect(c.searchText.trim()).toBe('easy');
    expect(c.starDifficulty.max).toBe(4);
    expect(c.starDifficulty.min).toBeNull();
  });

  it('inclusive star queries', () => {
    const c = parse('stars>=6');
    expect(c.starDifficulty.min).toBe(6);
    expect(c.starDifficulty.isLowerInclusive).toBe(true);
  });

  it('approach rate', () => {
    const c = parse('ar>=9 difficult');
    expect(c.searchText.trim()).toBe('difficult');
    expect(c.approachRate.min!).toBeGreaterThan(8.9);
    expect(c.approachRate.min!).toBeLessThan(9);
    expect(c.approachRate.max).toBeNull();
  });

  it.each(['dr>2 quite specific dr<:6', 'hp>2 quite specific hp<=6'])('drain rate: %s', query => {
    const c = parse(query);
    expect(c.searchText.trim()).toBe('quite specific');
    expect(c.drainRate.min!).toBeGreaterThan(2);
    expect(c.drainRate.min!).toBeLessThan(2.1);
    expect(c.drainRate.max!).toBeGreaterThan(6);
  });

  it('bpm', () => {
    let c = parse('bpm=200');
    expect([c.bpm.min, c.bpm.max]).toEqual([199.5, 200.5]);
    c = parse('bpm>:200 gotta go fast');
    expect(c.searchText.trim()).toBe('gotta go fast');
    expect(c.bpm.min).toBe(199.5);
    expect(c.bpm.max).toBeNull();
  });

  it.each([
    ['23s', 23000, 1000], ['9m', 540000, 60000], ['0.25h', 900000, 3600000], ['70', 70000, 1000], ['7m27s', 447000, 1000],
    ['7:27', 447000, 1000], ['1h2m3s', 3723000, 1000], ['1h2m3.5s', 3723500, 1000], ['1:02:03', 3723000, 1000], ['6.5m', 390000, 60000],
    ['6h5m', 21900000, 60000], ['80m20s', 4820000, 1000], ['1h20s', 3620000, 1000],
  ])('length=%s', (q, expected, scale) => {
    const c = parse(`length=${q} time`);
    expect(c.searchText.trim()).toBe('time');
    expect(c.length.min).toBe(expected - scale / 2);
    expect(c.length.max).toBe(expected + scale / 2);
  });

  it.each(['7.5m27s', '7m27', '7m7m7m', '7m70s', '5s6m', '0:', ':0', '0:3:', '3:15.5'])('invalid length=%s', q => {
    expect(parse(`length=${q} time`).length.hasFilter).toBe(false);
  });

  it('divisor', () => {
    const c = parse("that's a time signature alright! divisor:12");
    expect(c.searchText.trim()).toBe("that's a time signature alright!");
    expect(c.searchTerms.length).toBe(5);
    expect([c.beatDivisor.min, c.beatDivisor.max, c.beatDivisor.isLowerInclusive, c.beatDivisor.isUpperInclusive]).toEqual([12, 12, true, true]);
  });

  it('status queries', () => {
    expect(parse('status=r').onlineStatus.values.has(BeatmapOnlineStatus.Ranked)).toBe(true);
    expect(parse('status!=r').onlineStatus.values.has(BeatmapOnlineStatus.Ranked)).toBe(false);
    expect(parse('status=ranked status=loved').onlineStatus.values.size).toBe(0);
    expect([...parse('status=ranked,loved').onlineStatus.values].sort()).toEqual([BeatmapOnlineStatus.Ranked, BeatmapOnlineStatus.Loved].sort());
    expect([...parse('status>=r').onlineStatus.values].sort()).toEqual(
      [BeatmapOnlineStatus.Ranked, BeatmapOnlineStatus.Approved, BeatmapOnlineStatus.Qualified, BeatmapOnlineStatus.Loved].sort());
    expect(parse('status>=r,l').onlineStatus.values.size).toBe(9);
    expect([...parse('status>r status<l').onlineStatus.values].sort()).toEqual([BeatmapOnlineStatus.Approved, BeatmapOnlineStatus.Qualified].sort());
  });

  it.each(['creator', 'author', 'mapper'])('%s queries', keyword => {
    const c = parse(`beatmap specifically by ${keyword}=my_fav`);
    expect(c.searchText.trim()).toBe('beatmap specifically by');
    expect(c.creator.searchTerm).toBe('my_fav');
  });

  it('title / artist / source text queries', () => {
    let c = parse('find me songs with title="a certain title" please');
    expect(c.searchText.trim()).toBe('find me songs with  please');
    expect([c.title.searchTerm, c.title.matchMode]).toEqual(['a certain title', MatchMode.IsolatedPhrase]);

    c = parse('artist="The Only One"!');
    expect(c.searchText.trim()).toBe('');
    expect([c.artist.searchTerm, c.artist.matchMode]).toEqual(['The Only One', MatchMode.FullPhrase]);

    c = parse('weird artist=double"quote');
    expect(c.searchText.trim()).toBe('weird');
    expect(c.artist.searchTerm).toBe('double"quote');

    expect(parse('artist=><something').artist.searchTerm).toBe('><something');

    c = parse('find me songs with source="unit tests" please');
    expect([c.source.searchTerm, c.source.matchMode]).toEqual(['unit tests', MatchMode.IsolatedPhrase]);
  });

  it.each(['unrecognised=keyword', 'cs=nope', 'bpm>=bad', 'divisor<nah', 'status=noidea'])('ignores %s', query => {
    expect(parse(query).searchText).toBe(query);
  });

  it('ranked date queries', () => {
    const c = parse('ranked=2020');
    expect(c.dateRanked.min!.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(c.dateRanked.max!.toISOString()).toBe('2021-01-01T00:00:00.000Z');
    expect([c.dateRanked.isLowerInclusive, c.dateRanked.isUpperInclusive]).toEqual([true, false]);
    expect(parse('ranked=2020-13').dateRanked.hasFilter).toBe(false);
  });
});
