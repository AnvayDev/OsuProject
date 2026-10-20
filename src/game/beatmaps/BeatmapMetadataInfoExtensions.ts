// Ported from osu.Game/Beatmaps/BeatmapMetadataInfoExtensions.cs (GetDisplayTitle).

import type { BeatmapMetadata } from './BeatmapMetadata';

/** A user-presentable display title representing this metadata. */
export function getDisplayTitle(metadataInfo: BeatmapMetadata): string {
  const author = !metadataInfo.author.username ? '' : ` (${metadataInfo.author.username})`;

  const artist = !metadataInfo.artist ? 'unknown artist' : metadataInfo.artist;
  const title = !metadataInfo.title ? 'unknown title' : metadataInfo.title;

  return `${artist} - ${title}${author}`.trim();
}
