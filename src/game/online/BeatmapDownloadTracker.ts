// Ported from osu.Game/Online/BeatmapDownloadTracker.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BeatmapModelDownloader } from '../beatmaps/BeatmapModelDownloader';
import type { IBeatmapSetInfo } from '../beatmaps/IBeatmapSetInfo';
import { RealmAccess } from '../database/RealmAccess';
import type { ArchiveDownloadRequest } from './api/ArchiveDownloadRequest';
import { DownloadState } from './DownloadState';
import { DownloadTracker } from './DownloadTracker';

export class BeatmapDownloadTracker extends DownloadTracker<IBeatmapSetInfo> {
  protected downloader: BeatmapModelDownloader | null = null;

  private attachedRequest: ArchiveDownloadRequest<IBeatmapSetInfo> | null = null;

  private realmSubscription: { dispose(): void } | null = null;

  private realm!: RealmAccess;

  constructor(trackedItem: IBeatmapSetInfo) {
    super(trackedItem);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.downloader = dependencies.get(BeatmapModelDownloader);
    this.realm = dependencies.resolve(RealmAccess);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    const downloader = this.downloader;

    if (downloader === null)
      return;

    downloader.downloadBegan.add(this.downloadBegan);
    downloader.downloadFailed.add(this.downloadFailed);

    // Used to interact with manager classes that don't support interface types. Will eventually be replaced.
    const beatmapSetInfo: IBeatmapSetInfo = { onlineID: this.trackedItem.onlineID };

    const onlineId = this.trackedItem.onlineID;

    this.realmSubscription = this.realm.registerForNotifications(all => all.filter(s => s.onlineID === onlineId && !s.deletePending), items => {
      if (items.length > 0) {
        this.schedule(() => {
          this.updateState(DownloadState.LocallyAvailable);
          this.attachDownload(null);
        });
      } else {
        this.schedule(() => {
          this.updateState(DownloadState.NotDownloaded);
          this.attachDownload(downloader.getExistingDownload(beatmapSetInfo));
        });
      }
    });
  }

  private readonly downloadBegan = (request: ArchiveDownloadRequest<IBeatmapSetInfo>) => this.schedule(() => {
    if (this.checkEquality(request.model, this.trackedItem))
      this.attachDownload(request);
  });

  private readonly downloadFailed = (request: ArchiveDownloadRequest<IBeatmapSetInfo>) => this.schedule(() => {
    if (this.checkEquality(request.model, this.trackedItem))
      this.attachDownload(null);
  });

  private attachDownload(request: ArchiveDownloadRequest<IBeatmapSetInfo> | null): void {
    if (this.attachedRequest !== null) {
      this.attachedRequest.failure.remove(this.onRequestFailure);
      this.attachedRequest.downloadProgressed.remove(this.onRequestProgress);
      this.attachedRequest.success.remove(this.onRequestSuccess);
    }

    this.attachedRequest = request;

    if (this.attachedRequest !== null) {
      if (this.attachedRequest.progress === 1) {
        this.updateProgress(1);
        this.updateState(DownloadState.Importing);
      } else {
        this.updateProgress(this.attachedRequest.progress);
        this.updateState(DownloadState.Downloading);

        this.attachedRequest.failure.add(this.onRequestFailure);
        this.attachedRequest.downloadProgressed.add(this.onRequestProgress);
        this.attachedRequest.success.add(this.onRequestSuccess);
      }
    } else {
      if (this.state.value === DownloadState.Downloading)
        this.updateState(DownloadState.NotDownloaded);
    }
  }

  private readonly onRequestSuccess = () => this.schedule(() => this.updateState(DownloadState.Importing));

  private readonly onRequestProgress = (progress: number) => this.schedule(() => this.updateProgress(progress));

  private readonly onRequestFailure = () => this.schedule(() => this.attachDownload(null));

  private checkEquality(x: IBeatmapSetInfo, y: IBeatmapSetInfo): boolean {
    return x.onlineID === y.onlineID;
  }

  // #region Disposal

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);
    this.attachDownload(null);

    this.realmSubscription?.dispose();

    if (this.downloader !== null) {
      this.downloader.downloadBegan.remove(this.downloadBegan);
      this.downloader.downloadFailed.remove(this.downloadFailed);
    }
  }

  // #endregion
}
