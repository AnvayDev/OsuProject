// Ported from osu.Game/Beatmaps/BeatmapMetadataInfoExtensions.cs (GetDisplayTitle, Match).

import type { OptionalTextFilter } from '../screens/select/FilterCriteria';
import type { BeatmapMetadata } from './BeatmapMetadata';

/** A user-presentable display title representing this metadata. */
export function getDisplayTitle(metadataInfo: BeatmapMetadata): string {
  const author = !metadataInfo.author.username ? '' : ` (${metadataInfo.author.username})`;

  const artist = !metadataInfo.artist ? 'unknown artist' : metadataInfo.artist;
  const title = !metadataInfo.title ? 'unknown title' : metadataInfo.title;

  return `${artist} - ${title}${author}`.trim();
}

export function match(metadataInfo: BeatmapMetadata, filter: OptionalTextFilter): boolean {
  if (filter.matches(metadataInfo.author.username)) return true;
  if (filter.matches(metadataInfo.artist)) return true;
  if (filter.matches(metadataInfo.artistUnicode)) return true;
  if (filter.matches(metadataInfo.title)) return true;
  if (filter.matches(metadataInfo.titleUnicode)) return true;
  if (filter.matches(metadataInfo.source)) return true;
  if (filter.matches(metadataInfo.tags)) return true;

  return false;
}
