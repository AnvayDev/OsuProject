// Ported from osu.Game/Beatmaps/BeatmapSetInfoExtensions.cs (GetOnlineURL).
// There's no API provider: api.Endpoints.WebsiteUrl is the production endpoint's.

import type { RulesetInfo } from '../rulesets/RulesetInfo';
import type { BeatmapSetInfo } from './BeatmapSetInfo';

/** (ProductionEndpointConfiguration.WebsiteUrl) */
export const WEBSITE_URL = 'https://osu.ppy.sh';

/** Get the beatmap set info page URL, or null if unavailable. */
export function getOnlineURL(beatmapSetInfo: BeatmapSetInfo, ruleset: RulesetInfo | null = null): string | null {
  if (beatmapSetInfo.onlineID <= 0)
    return null;

  if (ruleset !== null)
    return `${WEBSITE_URL}/beatmapsets/${beatmapSetInfo.onlineID}#${ruleset.shortName}`;

  return `${WEBSITE_URL}/beatmapsets/${beatmapSetInfo.onlineID}`;
}
