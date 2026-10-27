// Ported from osu.Game/Online/API/Requests/DownloadBeatmapSetRequest.cs
// Web: the target is the mirror's download endpoint instead of osu-web's beatmapsets/{id}/download (docs/spec/assets-formats.md §7).

import type { IBeatmapSetInfo } from '../../../beatmaps/IBeatmapSetInfo';
import { ArchiveDownloadRequest } from '../ArchiveDownloadRequest';
import { MIRROR_ROOT } from '../MirrorAccess';

export class DownloadBeatmapSetRequest extends ArchiveDownloadRequest<IBeatmapSetInfo> {
  private readonly noVideo: boolean;

  constructor(set: IBeatmapSetInfo, noVideo: boolean) {
    super(set);

    this.noVideo = noVideo;
    this.timeout = 60000;
  }

  protected override get fileExtension(): string {
    return '.osz';
  }

  protected override get uri(): string {
    return `${MIRROR_ROOT}/d/${this.model.onlineID}${this.noVideo ? '?noVideo=1' : ''}`;
  }
}
