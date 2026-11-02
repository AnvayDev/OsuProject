// Ported from osu.Game/Online/API/Requests/GetBeatmapSetRequest.cs (the beatmap set ID lookup).
// Web: osu-web's beatmapsets/{id} needs an osu! API login. catboy.best's mirror serves the same JSON (including the ratings, genre, language
// and fail times that osu.direct's doesn't), with CORS, so the request goes there (docs/spec/assets-formats.md §7 lists the mirrors).

import { APIBeatmapSet } from './responses/APIBeatmapSet';

export const BEATMAP_SET_LOOKUP_ROOT = 'https://catboy.best/api/v2/s';

export class GetBeatmapSetRequest {
  constructor(readonly onlineBeatmapSetID: number) {}

  /** The beatmap set, or null if the lookup failed (C#'s request failure). */
  async perform(signal?: AbortSignal): Promise<APIBeatmapSet | null> {
    const response = await fetch(`${BEATMAP_SET_LOOKUP_ROOT}/${this.onlineBeatmapSetID}`, { signal });
    if (!response.ok)
      return null;

    const json = await response.json();
    return json?.id === this.onlineBeatmapSetID ? APIBeatmapSet.fromJson(json) : null;
  }
}
