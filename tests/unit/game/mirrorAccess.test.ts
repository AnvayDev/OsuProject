// MirrorAccess: every mirror request starts within the mirror's limits (25 per 5 seconds, 120 per minute).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mirrorFetch } from '@game/online/api/MirrorAccess';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('mirrorFetch', () => {
  it('holds requests back to the burst and per-minute limits', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
    const fetchMock = vi.fn(async () => new Response());
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 121; i++)
      void mirrorFetch(`https://osu.direct/api/v2/md5/${i}`);

    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(25);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(50);

    // 120 requests start in the first 20 seconds; the 121st waits for the first to leave the minute.
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetchMock).toHaveBeenCalledTimes(120);

    await vi.advanceTimersByTimeAsync(39999);
    expect(fetchMock).toHaveBeenCalledTimes(120);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(121);
  });
});
