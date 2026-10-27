// Ported from osu.Game/Database/ModelDownloader.cs
// Not ported yet: notifications (DownloadNotification, TooManyDownloadsNotification — there is no NotificationOverlay), DownloadAsUpdate.
// Web: there is no IAPIProvider (see APIDownloadRequest), so a download is always possible and the request performs itself.

import { Signal } from '@fw/bindables/Signal';
import { Logger } from '@fw/logging/Logger';
import { OperationCanceledError } from '../online/api/APIDownloadRequest';
import type { ArchiveDownloadRequest } from '../online/api/ArchiveDownloadRequest';
import { ImportTask } from './ImportTask';
import { titleCase } from './RealmArchiveModelImporter';

/** (IModelImporter<TModel>: the members used here) */
export interface IModelImporter<TModel> {
  import(tasks: ImportTask[]): Promise<TModel[]>;
  readonly humanisedModelName: string;
}

export abstract class ModelDownloader<TModel, T> {
  readonly downloadBegan = new Signal<ArchiveDownloadRequest<T>>();

  readonly downloadFailed = new Signal<ArchiveDownloadRequest<T>>();

  private readonly importer: IModelImporter<TModel>;

  protected readonly currentDownloads: ArchiveDownloadRequest<T>[] = [];

  protected constructor(importer: IModelImporter<TModel>) {
    this.importer = importer;
  }

  /**
   * Creates the download request for this T.
   * @param minimiseDownloadSize Whether this download should be optimised for slow connections. Generally means extras are not included in
   * the download bundle.
   */
  protected abstract createDownloadRequest(model: T, minimiseDownloadSize: boolean): ArchiveDownloadRequest<T>;

  download(model: T, minimiseDownloadSize = false): boolean {
    if (!this.canDownload(model)) return false;

    const request = this.createDownloadRequest(model, minimiseDownloadSize);

    const triggerFailure = (error: Error) => {
      this.removeDownload(request);

      this.downloadFailed.emit(request);

      if (!(error instanceof OperationCanceledError))
        Logger.error(error, `${titleCase(this.importer.humanisedModelName)} download failed!`);
    };

    request.success.add(({ data, filename }) => {
      void (async () => {
        let importSuccessful = false;

        try {
          importSuccessful = (await this.importer.import([new ImportTask(data, filename)])).length > 0;
        } finally {
          // for now a failed import will be marked as a failed download for simplicity.
          if (!importSuccessful)
            this.downloadFailed.emit(request);

          this.removeDownload(request);
        }
      })();
    });

    request.failure.add(triggerFailure);

    this.currentDownloads.push(request);

    void request.perform();

    this.downloadBegan.emit(request);
    return true;
  }

  abstract getExistingDownload(model: T): ArchiveDownloadRequest<T> | null;

  private canDownload(model: T): boolean {
    return this.getExistingDownload(model) === null;
  }

  private removeDownload(request: ArchiveDownloadRequest<T>): void {
    const i = this.currentDownloads.indexOf(request);
    if (i >= 0) this.currentDownloads.splice(i, 1);
  }
}
