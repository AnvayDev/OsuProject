// Ported from osu.Game/Collections/CollectionToggleMenuItem.cs

import { MenuItemType } from '../graphics/userInterface/MenuItemType';
import { ToggleMenuItem } from '../graphics/userInterface/ToggleMenuItem';
import type { Live } from '../database/Live';
import { type BeatmapCollection, removeFrom } from './BeatmapCollection';

export class CollectionToggleMenuItem extends ToggleMenuItem {
  constructor(collection: Live<BeatmapCollection>, beatmap: { readonly md5Hash: string }) {
    super(collection.performRead(c => c.name), MenuItemType.Standard, state => void collection.performWrite(c => {
      if (state)
        c.beatmapMD5Hashes.push(beatmap.md5Hash);
      else
        removeFrom(c.beatmapMD5Hashes, beatmap.md5Hash);
    }));

    this.state.value = collection.performRead(c => c.beatmapMD5Hashes.includes(beatmap.md5Hash));
  }
}

