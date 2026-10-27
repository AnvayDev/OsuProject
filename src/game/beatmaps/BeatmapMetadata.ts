// Ported from osu.Game/Beatmaps/BeatmapMetadata.cs

import { RealmUser } from '../models/RealmUser';
import { getDisplayTitle } from './BeatmapMetadataInfoExtensions';

/** A realm model containing metadata for a beatmap. */
export class BeatmapMetadata {
  title = '';

  titleUnicode = '';

  artist = '';

  artistUnicode = '';

  author = new RealmUser();

  source = '';

  tags = '';

  /** The list of user-voted tags applicable to this beatmap. This information is populated from online sources (osu-web) and can change after initial import. */
  userTags: string[] = [];

  /** The time in milliseconds to begin playing the track for preview purposes. If -1, the track should begin playing at 40% of its length. */
  previewTime = -1;

  audioFile = '';

  backgroundFile = '';

  /** C#'s object initialiser shape. */
  static from(props: Partial<Omit<BeatmapMetadata, 'author'>> & { author?: Partial<RealmUser> }): BeatmapMetadata {
    const m = new BeatmapMetadata();
    const { author, ...rest } = props;
    Object.assign(m, rest);
    if (author) Object.assign(m.author, author);
    return m;
  }

  deepClone(): BeatmapMetadata {
    const m = new BeatmapMetadata();
    Object.assign(m, this);
    m.author = this.author.deepClone();
    m.userTags = [...this.userTags];
    return m;
  }

  toString(): string {
    return getDisplayTitle(this);
  }
}
