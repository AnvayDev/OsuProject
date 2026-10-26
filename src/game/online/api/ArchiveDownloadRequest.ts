// Ported from osu.Game/Online/API/ArchiveDownloadRequest.cs

import { Signal } from '@fw/bindables/Signal';
import { APIDownloadRequest } from './APIDownloadRequest';

export abstract class ArchiveDownloadRequest<TModel> extends APIDownloadRequest {
  readonly model: TModel;

  private _progress = 0;

  get progress(): number {
    return this._progress;
  }

  readonly downloadProgressed = new Signal<number>();

  protected constructor(model: TModel) {
    super();

    this.model = model;

    this.progressed.add(({ current, total }) => this.setProgress(Math.fround(current / total)));
  }

  protected setProgress(progress: number): void {
    this._progress = progress;
    this.downloadProgressed.emit(progress);
  }
}
