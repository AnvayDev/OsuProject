// Ported from osu.Game/Overlays/Music/Playlist.cs

import type { Drawable } from '@fw/graphics/Drawable';
import type { ScrollContainer } from '@fw/graphics/containers/ScrollContainer';
import { VirtualisedListContainer } from '@fw/graphics/containers/VirtualisedListContainer';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import { OsuScrollContainer } from '../../graphics/containers/OsuScrollContainer';
import { PlaylistItem } from './PlaylistItem';

export class Playlist extends VirtualisedListContainer<BeatmapSetInfo, PlaylistItem> {
  // (C# re-exposes Padding publicly; it is already public here)

  constructor() {
    super(PlaylistItem, 20, 50);
  }

  protected override createScrollContainer(): ScrollContainer<Drawable> {
    return new OsuScrollContainer();
  }
}
