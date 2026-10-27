// Web-only: osu! talks to its own API (APIAccess); the web build's online data and downloads come from the osu.direct mirror instead
// (docs/spec/assets-formats.md §7). The mirror rate limits all of its endpoints together, to 120 requests a minute with bursts of 25 per
// 5 seconds, and its 429 responses carry no CORS headers (they read as network failures), so every mirror request starts through here,
// no sooner than both limits allow.

import type { IResourceStore } from '@fw/io/ResourceStore';

export const MIRROR_ROOT = 'https://osu.direct/api';

const limits = [{ window: 5000, count: 25 }, { window: 60000, count: 120 }];

/** Start times of the requests in the longest window, oldest first. */
const starts: number[] = [];

/** The time the next request may start at, reserving it. */
function reserveStart(): number {
  let start = Math.max(performance.now(), starts.at(-1) ?? 0);

  for (const { window, count } of limits) {
    if (starts.length >= count)
      start = Math.max(start, starts[starts.length - count] + window);
  }

  starts.push(start);

  const longest = limits[limits.length - 1];
  while (starts.length > longest.count) starts.shift();

  return start;
}

/** fetch, started once the mirror's rate limits allow it. init is created at the start (a timeout signal doesn't count the wait). */
export function mirrorFetch(url: string, init: () => RequestInit = () => ({})): Promise<Response> {
  const delay = reserveStart() - performance.now();

  return new Promise(resolve => setTimeout(resolve, delay))
    .then(() => fetch(url, init()));
}

/** A resource store over mirror URLs (OnlineStore with the mirror's rate limits); any failure yields null. */
export class MirrorResourceStore implements IResourceStore<Blob> {
  async get(url: string): Promise<Blob | null> {
    if (!url.startsWith(MIRROR_ROOT))
      return null;

    try {
      const r = await mirrorFetch(url);
      return r.ok ? await r.blob() : null;
    } catch {
      return null;
    }
  }

  getAvailableResources(): readonly string[] {
    return [];
  }
}
