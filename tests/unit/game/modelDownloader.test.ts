// BeatmapModelDownloader (ModelDownloader.cs) over a stubbed mirror fetch (DownloadBeatmapSetRequest, APIDownloadRequest).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeatmapModelDownloader } from '@game/beatmaps/BeatmapModelDownloader';
import type { BeatmapSetInfo } from '@game/beatmaps/BeatmapSetInfo';
import type { ImportTask } from '@game/database/ImportTask';

/** A fetch response streaming the chunks, released one at a time by next(). */
function streamingResponse(chunks: Uint8Array[], status = 200) {
  let release: () => void = () => {};
  let index = 0;

  const response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers({ 'Content-Length': String(chunks.reduce((n, c) => n + c.length, 0)) }),
    body: {
      getReader: () => ({
        read: () => new Promise<{ done: boolean; value?: Uint8Array }>(resolve => {
          release = () => resolve(index < chunks.length ? { done: false, value: chunks[index++] } : { done: true });
        }),
      }),
    },
  };

  return { response, next: async () => { release(); await new Promise(r => setTimeout(r, 0)); } };
}

const flush = () => new Promise(r => setTimeout(r, 0));

function makeDownloader(importResult: (task: ImportTask) => BeatmapSetInfo[]) {
  const imported: ImportTask[] = [];
  const downloader = new BeatmapModelDownloader({
    humanisedModelName: 'beatmap',
    import: async tasks => {
      imported.push(...tasks);
      return importResult(tasks[0]);
    },
  });
  return { downloader, imported };
}

afterEach(() => vi.unstubAllGlobals());

describe('BeatmapModelDownloader', () => {
  it('downloads from the mirror with progress and imports the archive', async () => {
    const { response, next } = streamingResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);

    const { downloader, imported } = makeDownloader(() => [{} as BeatmapSetInfo]);
    const began: number[] = [];
    const failed: number[] = [];
    downloader.downloadBegan.add(r => began.push(r.model.onlineID));
    downloader.downloadFailed.add(r => failed.push(r.model.onlineID));

    expect(downloader.download({ onlineID: 42 })).toBe(true);
    expect(began).toEqual([42]);

    const request = downloader.getExistingDownload({ onlineID: 42 })!;
    const progress: number[] = [];
    request.downloadProgressed.add(p => progress.push(p));

    // an existing download blocks another of the same set.
    expect(downloader.download({ onlineID: 42 })).toBe(false);

    await flush();
    await next();
    await next();
    await next();
    await flush();

    expect(fetchMock).toHaveBeenCalledWith('https://osu.direct/api/d/42', expect.anything());
    expect(progress).toEqual([0.5, 1]);
    expect(imported.map(t => [t.path, [...t.stream]])).toEqual([['download.osz', [1, 2, 3, 4]]]);
    expect(failed).toEqual([]);
    expect(downloader.getExistingDownload({ onlineID: 42 })).toBeNull();
  });

  it('requests the no-video archive when minimising the download size', async () => {
    const fetchMock = vi.fn(async () => streamingResponse([]).response);
    vi.stubGlobal('fetch', fetchMock);

    makeDownloader(() => []).downloader.download({ onlineID: 7 }, true);
    await flush();

    expect(fetchMock).toHaveBeenCalledWith('https://osu.direct/api/d/7?noVideo=1', expect.anything());
  });

  it('fails a download the mirror rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamingResponse([], 404).response));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { downloader, imported } = makeDownloader(() => []);
    const failed: number[] = [];
    downloader.downloadFailed.add(r => failed.push(r.model.onlineID));

    downloader.download({ onlineID: 1 });
    await flush();
    await flush();

    expect(failed).toEqual([1]);
    expect(imported).toEqual([]);
    expect(downloader.getExistingDownload({ onlineID: 1 })).toBeNull();
  });

  it('fails a cancelled download without importing', async () => {
    const { response } = streamingResponse([new Uint8Array([1])]);
    vi.stubGlobal('fetch', vi.fn(async () => response));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { downloader, imported } = makeDownloader(() => []);
    const failed: number[] = [];
    downloader.downloadFailed.add(r => failed.push(r.model.onlineID));

    downloader.download({ onlineID: 3 });
    await flush();
    downloader.getExistingDownload({ onlineID: 3 })!.cancel();
    await flush();

    expect(failed).toEqual([3]);
    expect(imported).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });

  it('marks a download whose import produced nothing as failed', async () => {
    const { response, next } = streamingResponse([new Uint8Array([9])]);
    vi.stubGlobal('fetch', vi.fn(async () => response));

    const { downloader } = makeDownloader(() => []);
    const failed: number[] = [];
    downloader.downloadFailed.add(r => failed.push(r.model.onlineID));

    downloader.download({ onlineID: 5 });
    await flush();
    await next();
    await next();
    await flush();

    expect(failed).toEqual([5]);
  });
});
