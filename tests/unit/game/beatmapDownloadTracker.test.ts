// BeatmapDownloadTracker (BeatmapDownloadTracker.cs): download state of a set across a BeatmapModelDownloader download and the import into
// BeatmapManager (fake-indexeddb, a stub AudioContext, a stubbed mirror fetch serving a fixture archive).

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IReadOnlyDependencyContainer, DependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import { Container } from '@fw/graphics/containers/Container';
import { ResourceStore } from '@fw/io/ResourceStore';
import { AudioThread } from '@fw/platform/AudioThread';
import { BeatmapManager } from '@game/beatmaps/BeatmapManager';
import { BeatmapModelDownloader } from '@game/beatmaps/BeatmapModelDownloader';
import { BeatmapUpdater } from '@game/beatmaps/BeatmapUpdater';
import { BeatmapUpdaterMetadataLookup } from '@game/beatmaps/BeatmapUpdaterMetadataLookup';
import { DummyWorkingBeatmap } from '@game/beatmaps/DummyWorkingBeatmap';
import '@game/beatmaps/formats/LegacyBeatmapDecoder';
import { RealmAccess } from '@game/database/RealmAccess';
import { BeatmapDownloadTracker } from '@game/online/BeatmapDownloadTracker';
import { DownloadState } from '@game/online/DownloadState';
import { createHost } from '../framework/testHost';

function fakeNode(): AudioNode {
  const node = { connect: () => node, disconnect: () => {}, gain: { value: 1 }, pan: { value: 0 } };
  return node as unknown as AudioNode;
}

const context = { destination: fakeNode(), createGain: fakeNode, createStereoPanner: fakeNode, createMediaElementSource: fakeNode } as unknown as BaseAudioContext;

const quickOsz = () => new Uint8Array(fs.readFileSync(path.resolve('tests/fixtures/osu-tests/241526 Soleily - Renatus_virtual_quick.osz')));

/** A mirror response serving the archive in two chunks; the second is held until release(). */
function archiveResponse(data: Uint8Array) {
  let release!: () => void;
  const held = new Promise<void>(resolve => release = resolve);
  const chunks = [data.subarray(0, data.length >> 1), data.subarray(data.length >> 1)];
  let index = 0;

  const response = {
    ok: true,
    status: 200,
    statusText: '',
    headers: new Headers({ 'Content-Length': String(data.length) }),
    body: {
      getReader: () => ({
        read: async () => {
          if (index === 1) await held;
          return index < chunks.length ? { done: false, value: chunks[index++] } : { done: true };
        },
      }),
    },
  };

  return { response, release };
}

let dbCounter = 0;
let realm: RealmAccess;
let manager: BeatmapManager;
let downloader: BeatmapModelDownloader;

class TestRoot extends Container {
  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const deps = new DependencyContainer(parent);
    deps.cache(realm);
    deps.cache(downloader);
    return deps;
  }
}

beforeEach(async () => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.stubGlobal('AudioContext', class {});

  realm = await RealmAccess.open(`tracker-test-${dbCounter++}`);
  const audio = new AudioManager(new AudioThread(), new ResourceStore(), new ResourceStore(), null, context);
  manager = new BeatmapManager(realm, audio, new DummyWorkingBeatmap(audio, null));

  const updater = new BeatmapUpdater(manager, new BeatmapUpdaterMetadataLookup({ tryLookup: async () => null }));
  manager.processBeatmap = (set, scope) => updater.process(set, scope);

  downloader = new BeatmapModelDownloader(manager);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createTracker(onlineID: number) {
  const { root, frame } = createHost();
  const container = new TestRoot();
  const tracker = new BeatmapDownloadTracker({ onlineID });

  root.add(container);
  container.add(tracker);
  frame();
  frame();

  const states: DownloadState[] = [];
  tracker.state.bindValueChanged(s => states.push(s.newValue), true);

  return { tracker, frame, states };
}

/** Steps frames until the condition holds (the import runs asynchronously). */
async function until(frame: (ms?: number) => void, condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++) {
    await new Promise(r => setTimeout(r, 5));
    frame(16);
  }
}

describe('BeatmapDownloadTracker', () => {
  it('follows a download through import to locally available', async () => {
    const { response, release } = archiveResponse(quickOsz());
    vi.stubGlobal('fetch', vi.fn(async () => response));

    const { tracker, frame, states } = createTracker(241526);
    expect(states).toEqual([DownloadState.NotDownloaded]);

    downloader.download({ onlineID: 241526 });
    await until(frame, () => tracker.progress.value > 0);

    expect(tracker.state.value).toBe(DownloadState.Downloading);
    expect(tracker.progress.value).toBeCloseTo(0.5, 2);

    release();
    await until(frame, () => tracker.state.value === DownloadState.LocallyAvailable);

    expect(states).toEqual([DownloadState.NotDownloaded, DownloadState.Downloading, DownloadState.Importing, DownloadState.LocallyAvailable]);
    expect(realm.allBeatmapSets().map(s => s.onlineID)).toEqual([241526]);
  });

  it('ignores downloads of other sets and returns to not downloaded when its download fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, statusText: '' })));

    const { frame, states } = createTracker(1);

    downloader.download({ onlineID: 2 });
    await until(frame, () => downloader.getExistingDownload({ onlineID: 2 }) === null);
    expect(states).toEqual([DownloadState.NotDownloaded]);

    downloader.download({ onlineID: 1 });
    await until(frame, () => states.length >= 3);

    expect(states).toEqual([DownloadState.NotDownloaded, DownloadState.Downloading, DownloadState.NotDownloaded]);
  });

  it('attaches to a download already in progress', async () => {
    const { response } = archiveResponse(quickOsz());
    vi.stubGlobal('fetch', vi.fn(async () => response));

    downloader.download({ onlineID: 241526 });

    const { tracker } = createTracker(241526);
    expect(tracker.state.value).toBe(DownloadState.Downloading);
  });
});
