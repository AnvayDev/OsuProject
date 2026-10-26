// Ported from osu.Game/Online/API/APIDownloadRequest.cs, with the parts of APIRequest.cs and osu.Framework/IO/Network/WebRequest.cs it uses
// (Perform, Cancel/Fail, Success/Failure, the inactivity timeout).
// Web: there is no osu! API (IAPIProvider/APIAccess): the request fetches its own uri (the mirror, through its rate limits: MirrorAccess)
// when performed, and the file is kept in memory rather than in a temp file, so Success carries the bytes.

import { Signal } from '@fw/bindables/Signal';
import { Logger, LoggingTarget } from '@fw/logging/Logger';
import { mirrorFetch } from './MirrorAccess';

/** WebRequest.DEFAULT_TIMEOUT */
const DEFAULT_TIMEOUT = 10000;

enum APIRequestCompletionState {
  Waiting,
  Completed,
  Failed,
}

export class OperationCanceledError extends Error {
}

export abstract class APIDownloadRequest {
  /** Used to set the extension of the file returned by this request. */
  protected get fileExtension(): string {
    return '.tmp';
  }

  /** (APIRequest.Uri) */
  protected abstract get uri(): string;

  /** The amount of time from last sent or received data to trigger a timeout and abort the request (WebRequest.Timeout). */
  protected timeout = DEFAULT_TIMEOUT;

  /** (APIProgressHandler: current, total) */
  readonly progressed = new Signal<{ current: number; total: number }>();

  /** The downloaded file, with a name carrying fileExtension. */
  readonly success = new Signal<{ data: Uint8Array; filename: string }>();

  readonly failure = new Signal<Error>();

  private completionState = APIRequestCompletionState.Waiting;
  private readonly abortController = new AbortController();

  async perform(): Promise<void> {
    if (this.isFailing) return;

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    // (WebRequest.reportForwardProgress)
    const reportForwardProgress = () => {
      clearTimeout(timeoutHandle);
      timeoutHandle = setTimeout(() => this.fail(new Error('Request timed out')), this.timeout);
    };

    let data: Uint8Array;

    try {
      Logger.log(`Performing request ${this.uri}`, LoggingTarget.Network);

      const response = await mirrorFetch(this.uri, () => {
        reportForwardProgress();
        return { signal: this.abortController.signal };
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);

      const total = Number(response.headers.get('Content-Length') ?? 0);
      const chunks: Uint8Array[] = [];
      let current = 0;

      const reader = response.body!.getReader();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        reportForwardProgress();
        chunks.push(value);
        current += value.length;

        if (total > 0)
          this.progressed.emit({ current, total });
      }

      data = new Uint8Array(current);
      let offset = 0;

      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
    } catch (e) {
      // a cancellation or timeout has already failed the request (the fetch rejects with an AbortError).
      this.fail(e instanceof Error ? e : new Error(String(e)));
      return;
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (this.isFailing) return;

    // (C#'s temp file name)
    this.triggerSuccess({ data, filename: `download${this.fileExtension}` });
  }

  private triggerSuccess(file: { data: Uint8Array; filename: string }): void {
    if (this.completionState !== APIRequestCompletionState.Waiting)
      return;

    this.completionState = APIRequestCompletionState.Completed;
    this.success.emit(file);
  }

  cancel(): void {
    this.fail(new OperationCanceledError('Request cancelled'));
  }

  fail(e: Error): void {
    if (this.completionState !== APIRequestCompletionState.Waiting)
      return;

    this.completionState = APIRequestCompletionState.Failed;
    this.abortController.abort();

    Logger.log(`Failing request ${this.uri} (${e})`, LoggingTarget.Network);
    this.failure.emit(e);
  }

  private get isFailing(): boolean {
    return this.completionState === APIRequestCompletionState.Failed;
  }
}
