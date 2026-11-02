// Ported from osu.Game/Collections/DeleteCollectionDialog.cs

import { DeletionDialog } from '../overlays/dialog/DeletionDialog';
import type { Live } from '../database/Live';
import type { BeatmapCollection } from './BeatmapCollection';

export class DeleteCollectionDialog extends DeletionDialog {
  constructor(collection: Live<BeatmapCollection>, deleteAction: () => void) {
    super();

    // (CommonStrings.BeatmapsCount: "{0} beatmap|{0} beatmaps")
    this.bodyText = collection.performRead(c => `${c.name} (${c.beatmapMD5Hashes.length} ${c.beatmapMD5Hashes.length === 1 ? 'beatmap' : 'beatmaps'})`);
    this.dangerousAction = deleteAction;
  }
}
