// Ported from osu.Game/Beatmaps/BeatmapModelDownloader.cs

import { type IModelImporter, ModelDownloader } from '../database/ModelDownloader';
import type { ArchiveDownloadRequest } from '../online/api/ArchiveDownloadRequest';
import { DownloadBeatmapSetRequest } from '../online/api/requests/DownloadBeatmapSetRequest';
import type { BeatmapSetInfo } from './BeatmapSetInfo';
import type { IBeatmapSetInfo } from './IBeatmapSetInfo';

export class BeatmapModelDownloader extends ModelDownloader<BeatmapSetInfo, IBeatmapSetInfo> {
  protected override createDownloadRequest(set: IBeatmapSetInfo, minimiseDownloadSize: boolean): ArchiveDownloadRequest<IBeatmapSetInfo> {
    return new DownloadBeatmapSetRequest(set, minimiseDownloadSize);
  }

  override getExistingDownload(model: IBeatmapSetInfo): ArchiveDownloadRequest<IBeatmapSetInfo> | null {
    return this.currentDownloads.find(r => r.model.onlineID === model.onlineID) ?? null;
  }

  constructor(beatmapImporter: IModelImporter<BeatmapSetInfo>) {
    super(beatmapImporter);
  }
}
