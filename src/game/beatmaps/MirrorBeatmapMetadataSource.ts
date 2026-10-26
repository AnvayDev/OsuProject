// Web replacement for osu.Game/Beatmaps/APIBeatmapMetadataSource.cs (IOnlineBeatmapMetadataSource): there is no osu! API access, so the
// osu-web data comes from the osu.direct mirror (docs/spec/assets-formats.md §7). osu-web's beatmap lookup embeds the beatmap set; the
// mirror's doesn't, so the set (status and dates) is a second request, shared by a set's beatmaps.
// Like the API source: a beatmap the mirror doesn't know is a performed lookup with no result; a failed request is a lookup not performed.
// The file name fallback (GetBeatmapRequest's filename) isn't available on the mirror.
// Requests go through the mirror's rate limits (MirrorAccess), where osu! limits its own concurrency (BeatmapUpdater's four update threads).

import { MIRROR_ROOT, mirrorFetch } from '../online/api/MirrorAccess';
import { BeatmapOnlineStatus } from './BeatmapOnlineStatus';
import type { BeatmapInfo } from './BeatmapInfo';
import type { OnlineBeatmapMetadata } from './OnlineBeatmapMetadata';

const mirror_root = `${MIRROR_ROOT}/v2`;
const request_timeout = 10_000;

const lookupFetch = (url: string) => mirrorFetch(url, () => ({ signal: AbortSignal.timeout(request_timeout) }));

/** (APIBeatmap's status: osu-web's ranked status names) */
const statuses: Record<string, BeatmapOnlineStatus> = {
  graveyard: BeatmapOnlineStatus.Graveyard,
  wip: BeatmapOnlineStatus.WIP,
  pending: BeatmapOnlineStatus.Pending,
  ranked: BeatmapOnlineStatus.Ranked,
  approved: BeatmapOnlineStatus.Approved,
  qualified: BeatmapOnlineStatus.Qualified,
  loved: BeatmapOnlineStatus.Loved,
};

const parseStatus = (status: unknown) => statuses[String(status)] ?? BeatmapOnlineStatus.None;
const parseDate = (date: unknown) => typeof date === 'string' ? new Date(date) : null;

interface MirrorBeatmap {
  id: number;
  beatmapset_id: number;
  user_id: number;
  status: string;
  checksum: string;
  last_updated: string;
  difficulty_rating: number;
}

interface MirrorBeatmapSet {
  status: string;
  ranked_date: string | null;
  submitted_date: string | null;
}

/** The result of a lookup: null when it wasn't performed (C#'s false return). */
export type LookupResult = { onlineMetadata: OnlineBeatmapMetadata | null } | null;

export class MirrorBeatmapMetadataSource {
  private readonly beatmapSets = new Map<number, Promise<MirrorBeatmapSet | null>>();

  /** Whether this source can currently service lookups. */
  get available(): boolean {
    return navigator.onLine;
  }

  async tryLookup(beatmapInfo: BeatmapInfo): Promise<LookupResult> {
    if (!this.available)
      return null;

    try {
      const response = await lookupFetch(`${mirror_root}/md5/${beatmapInfo.md5Hash}`);

      if (response.status === 404)
        return { onlineMetadata: null };

      if (!response.ok)
        return null;

      const res = await response.json() as MirrorBeatmap;
      const set = await this.getBeatmapSet(res.beatmapset_id);

      return {
        onlineMetadata: {
          beatmapID: res.id,
          beatmapSetID: res.beatmapset_id,
          authorID: res.user_id,
          beatmapStatus: parseStatus(res.status),
          beatmapSetStatus: set !== null ? parseStatus(set.status) : null,
          dateRanked: parseDate(set?.ranked_date),
          dateSubmitted: parseDate(set?.submitted_date),
          md5Hash: res.checksum,
          lastUpdated: new Date(res.last_updated),
          // Tags are not populated because the response does not contain tag data.
          userTags: [],
          starRating: res.difficulty_rating,
        },
      };
    } catch {
      return null;
    }
  }

  private getBeatmapSet(id: number): Promise<MirrorBeatmapSet | null> {
    let set = this.beatmapSets.get(id);

    if (set === undefined) {
      set = lookupFetch(`${mirror_root}/s/${id}`)
        .then(r => r.ok ? r.json() as Promise<MirrorBeatmapSet> : null)
        .catch(() => null)
        // (a failed request is retried by the next lookup)
        .then(s => {
          if (s === null) this.beatmapSets.delete(id);
          return s;
        });
      this.beatmapSets.set(id, set);
    }

    return set;
  }
}
