// Ported from osu.Game/Online/API/Requests/Responses/APIBeatmapSet.cs (the members used so far), with the JSON mapping of its
// [JsonProperty]s, and the structs it holds (BeatmapSetOnlineCovers, BeatmapSetOnlineAvailability, BeatmapSetHypeStatus,
// BeatmapSetNominationStatus).

import type { IBeatmapSetInfo } from '../../../../beatmaps/IBeatmapSetInfo';
import { BeatmapOnlineStatus } from '../../../../beatmaps/BeatmapOnlineStatus';
import { APIBeatmap, parseBeatmapOnlineStatus, parseDateTimeOffset } from './APIBeatmap';
import { APIUser } from './APIUser';

/** (BeatmapSetOnlineCovers: the @2x images, as C# maps them) */
export interface BeatmapSetOnlineCovers {
  readonly cover: string;
  readonly card: string;
  readonly list: string;
}

/** (BeatmapSetOnlineAvailability) */
export interface BeatmapSetOnlineAvailability {
  readonly downloadDisabled: boolean;
  readonly externalLink: string | null;
}

/** (BeatmapSetHypeStatus) */
export interface BeatmapSetHypeStatus {
  readonly current: number;
  readonly required: number;
}

/** (BeatmapSetNominationStatus, with RequiredMeta) */
export interface BeatmapSetNominationStatus {
  readonly current: number;
  readonly requiredMeta: { readonly mainRuleset: number; readonly nonMainRuleset: number };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export class APIBeatmapSet implements IBeatmapSetInfo {
  covers: BeatmapSetOnlineCovers = { cover: '', card: '', list: '' };

  onlineID = 0;

  status = BeatmapOnlineStatus.None;

  preview = '';

  hasFavourited = false;

  playCount = 0;

  favouriteCount = 0;

  bpm = 0;

  hasExplicitContent = false;

  featuredInSpotlight = false;

  hasVideo = false;

  hasStoryboard = false;

  submitted = new Date(0);

  ranked: Date | null = null;

  lastUpdated: Date | null = null;

  trackId: number | null = null;

  hypeStatus: BeatmapSetHypeStatus | null = null;

  nominationStatus: BeatmapSetNominationStatus | null = null;

  title = '';

  titleUnicode = '';

  artist = '';

  artistUnicode = '';

  author = new APIUser();

  availability: BeatmapSetOnlineAvailability = { downloadDisabled: false, externalLink: null };

  source = '';

  tags = '';

  beatmaps: APIBeatmap[] = [];

  static fromJson(json: any): APIBeatmapSet {
    const s = new APIBeatmapSet();

    const covers = json.covers ?? {};
    s.covers = { cover: covers['cover@2x'] ?? '', card: covers['card@2x'] ?? '', list: covers['list@2x'] ?? '' };

    s.onlineID = json.id ?? 0;
    s.status = parseBeatmapOnlineStatus(json.status);
    s.preview = json.preview_url ?? '';
    s.hasFavourited = json.has_favourited ?? false;
    s.playCount = json.play_count ?? 0;
    s.favouriteCount = json.favourite_count ?? 0;
    s.bpm = json.bpm ?? 0;
    s.hasExplicitContent = json.nsfw ?? false;
    s.featuredInSpotlight = json.spotlight ?? false;
    s.hasVideo = json.video ?? false;
    s.hasStoryboard = json.storyboard ?? false;
    s.submitted = parseDateTimeOffset(json.submitted_date) ?? new Date(0);
    s.ranked = parseDateTimeOffset(json.ranked_date);
    s.lastUpdated = parseDateTimeOffset(json.last_updated);
    s.trackId = json.track_id ?? null;
    s.hypeStatus = json.hype ? { current: json.hype.current ?? 0, required: json.hype.required ?? 0 } : null;

    const nominations = json.nominations_summary;
    s.nominationStatus = nominations
      ? {
          current: nominations.current ?? 0,
          requiredMeta: {
            mainRuleset: nominations.required_meta?.main_ruleset ?? 0,
            nonMainRuleset: nominations.required_meta?.non_main_ruleset ?? 0,
          },
        }
      : null;

    s.title = json.title ?? '';
    s.titleUnicode = json.title_unicode ?? '';
    s.artist = json.artist ?? '';
    s.artistUnicode = json.artist_unicode ?? '';

    // ([JsonProperty("user")], or "user_id" and "creator" filling in an APIUser)
    if (json.user) {
      s.author.id = json.user.id ?? 1;
      s.author.username = json.user.username ?? '';
    } else {
      if (json.user_id !== undefined) s.author.id = json.user_id;
      if (json.creator !== undefined) s.author.username = json.creator;
    }

    s.availability = { downloadDisabled: json.availability?.download_disabled ?? false, externalLink: json.availability?.more_information ?? null };
    s.source = json.source ?? '';
    s.tags = json.tags ?? '';
    s.beatmaps = (json.beatmaps ?? []).map((b: any) => APIBeatmap.fromJson(b));

    return s;
  }
}
