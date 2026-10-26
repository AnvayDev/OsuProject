// Ported from osu.Game/Screens/Select/BeatmapDeleteDialog.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BeatmapManager } from '../../beatmaps/BeatmapManager';
import { getDisplayTitleRomanisable } from '../../beatmaps/BeatmapMetadataInfoExtensions';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import { DeletionDialog } from '../../overlays/dialog/DeletionDialog';

export class BeatmapDeleteDialog extends DeletionDialog {
  private readonly beatmapSet: BeatmapSetInfo;

  constructor(beatmapSet: BeatmapSetInfo) {
    super();

    this.beatmapSet = beatmapSet;
    this.bodyText = getDisplayTitleRomanisable(beatmapSet.metadata, false);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    const beatmapManager = dependencies.resolve(BeatmapManager);
    this.dangerousAction = () => void beatmapManager.delete(this.beatmapSet);
    return r;
  }
}
