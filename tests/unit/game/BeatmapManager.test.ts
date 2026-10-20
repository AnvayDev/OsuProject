// BeatmapManager / WorkingBeatmap / DummyWorkingBeatmap / BeatmapUpdater behaviour from the osu! source (WorkingBeatmap.cs, WorkingBeatmapCache.cs,
// BeatmapManager.cs, BeatmapUpdater.cs, RealmDetachedBeatmapStore's notification query), against fake-indexeddb and a stub AudioContext.

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '@fw/audio/AudioManager';
import { TrackVirtual } from '@fw/audio/track/TrackVirtual';
import { TrackWeb } from '@fw/audio/track/TrackWeb';
import { ResourceStore } from '@fw/io/ResourceStore';
import { AudioThread } from '@fw/platform/AudioThread';
import { Beatmap, BeatmapExtensions } from '@game/beatmaps/Beatmap';
import { BeatmapManager } from '@game/beatmaps/BeatmapManager';
import type { BeatmapSetInfo } from '@game/beatmaps/BeatmapSetInfo';
import { BeatmapUpdater } from '@game/beatmaps/BeatmapUpdater';
import { DummyWorkingBeatmap } from '@game/beatmaps/DummyWorkingBeatmap';
import { Decoder } from '@game/beatmaps/formats/Decoder';
import '@game/beatmaps/formats/LegacyBeatmapDecoder';
import { ImportTask } from '@game/database/ImportTask';
import { type ChangeSet, RealmAccess } from '@game/database/RealmAccess';
import { LineBufferedReader } from '@game/io/LineBufferedReader';
import { unzipSync } from 'fflate';

function fakeNode(): AudioNode {
  const node = { connect: () => node, disconnect: () => {}, gain: { value: 1 }, pan: { value: 0 } };
  return node as unknown as AudioNode;
}

const context = { destination: fakeNode(), createGain: fakeNode, createStereoPanner: fakeNode, createMediaElementSource: fakeNode } as unknown as BaseAudioContext;

const quickOsz = () => new Uint8Array(fs.readFileSync(path.resolve('tests/fixtures/osu-tests/241526 Soleily - Renatus_virtual_quick.osz')));
const track = (name: string) => new Uint8Array(fs.readFileSync(path.resolve('_reference/osu-resources/osu.Game.Resources/Tracks', name)));

let dbCounter = 0;
let realm: RealmAccess;
let audio: AudioManager;
let manager: BeatmapManager;

beforeEach(async () => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  // jsdom has no Web Audio; AudioManager only checks the context's type.
  vi.stubGlobal('AudioContext', class {});

  realm = await RealmAccess.open(`manager-test-${dbCounter++}`);
  audio = new AudioManager(new AudioThread(), new ResourceStore(), new ResourceStore(), context);
  manager = new BeatmapManager(realm, audio, new DummyWorkingBeatmap(audio, null));

  const updater = new BeatmapUpdater(manager);
  manager.processBeatmap = (set, scope) => updater.process(set, scope);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const importQuick = async () => (await manager.importTask(new ImportTask(quickOsz(), 'renatus.osz')))!;

describe('DummyWorkingBeatmap', () => {
  it('is the default beatmap, with a 1000 ms virtual track from construction', () => {
    const dummy = manager.defaultBeatmap;

    expect(dummy.metadata.artist).toBe('please select or load a beatmap!');
    expect(dummy.metadata.title).toBe('no beatmap selected!');
    expect(dummy.beatmapInfo.ruleset.shortName).toBe('dummy');
    expect(dummy.beatmapInfo.ruleset.onlineID).toBe(-1);
    expect(dummy.beatmapInfo.difficulty.circleSize).toBe(0);
    expect(dummy.beatmapInfo.difficulty.sliderMultiplier).toBe(1.4);
    expect(dummy.beatmapSetInfo.beatmaps).toEqual([]);

    expect(dummy.trackLoaded).toBe(true);
    expect(dummy.track).toBeInstanceOf(TrackVirtual);
    expect(dummy.track.length).toBe(1000);

    expect(manager.getWorkingBeatmap(null)).toBe(dummy);
    expect(manager.getWorkingBeatmap(dummy.beatmapInfo, true)).toBe(dummy);
  });
});

describe('BeatmapUpdater (at import)', () => {
  it('stores length, BPM and object counts computed from the decoded beatmaps', async () => {
    const set = await importQuick();
    const files = unzipSync(quickOsz());

    for (const beatmap of set.beatmaps) {
      const reader = new LineBufferedReader(files[beatmap.path!]);
      const decoded = Decoder.getDecoder(Beatmap, reader).decode(reader);

      expect(beatmap.length).toBe(BeatmapExtensions.calculatePlayableLength(decoded));
      expect(beatmap.bpm).toBe(60000 / decoded.getMostCommonBeatLength());
      expect(beatmap.totalObjectCount).toBe(decoded.hitObjects.length);
      expect(beatmap.length).toBeGreaterThan(0);
      // not looked up online yet
      expect(beatmap.starRating).toBe(-1);
    }

    // persisted
    expect(realm.findBeatmapSet(set.id)!.beatmaps.map(b => b.length)).toEqual(set.beatmaps.map(b => b.length));
  });

  it('gives an intro beatmap with fewer than two objects a star rating of 0', async () => {
    const set = (await manager.importTask(new ImportTask(track('triangles.osz'), 'triangles.osz')))!;

    expect(set.beatmaps[0].totalObjectCount).toBe(1);
    expect(set.beatmaps[0].starRating).toBe(0);
    expect(set.beatmaps[0].length).toBe(0);
    expect(set.beatmaps[0].bpm).toBeGreaterThan(0);
  });
});

describe('WorkingBeatmap', () => {
  it('is cached per beatmap and recreated on refetch', async () => {
    const set = await importQuick();
    const beatmap = set.beatmaps[0];

    const working = manager.getWorkingBeatmap(beatmap);
    expect(manager.getWorkingBeatmap(beatmap)).toBe(working);

    const refetched = manager.getWorkingBeatmap(beatmap, true);
    expect(refetched).not.toBe(working);
    expect(refetched.beatmapInfo).toBe(realm.findBeatmap(beatmap.id));
    expect(manager.getWorkingBeatmap(beatmap)).toBe(refetched);
  });

  it('decodes the beatmap asynchronously, keeping the stored identity', async () => {
    const set = await importQuick();
    const working = manager.getWorkingBeatmap(set.beatmaps[0]);

    expect(working.beatmapLoaded).toBe(false);
    expect(working.beatmap).toBeNull();

    const decoded = (await working.loadBeatmapAsync())!;

    expect(working.beatmapLoaded).toBe(true);
    expect(working.beatmap).toBe(decoded);
    expect(decoded.beatmapInfo).not.toBe(working.beatmapInfo);
    expect(decoded.beatmapInfo.id).toBe(working.beatmapInfo.id);
    expect(decoded.beatmapInfo.beatmapSet).toBe(working.beatmapInfo.beatmapSet);
    expect(decoded.hitObjects.length).toBe(working.beatmapInfo.totalObjectCount);
    expect(decoded.beatmapInfo.md5Hash).toBe(working.beatmapInfo.md5Hash);
  });

  it('falls back to a virtual track of length + 1000 for "virtual" audio, and prepares the preview point', async () => {
    const set = await importQuick();
    const working = manager.getWorkingBeatmap(set.beatmaps.find(b => b.difficultyName === 'Insane')!);

    const t = working.loadTrack();
    expect(t).toBeInstanceOf(TrackVirtual);
    expect(t.length).toBe(working.beatmapInfo.length + 1000);
    expect(working.tryTransferTrack(manager.getWorkingBeatmap(set.beatmaps[1]))).toBe(false);

    // PreviewTime 164471 is past the end of the short track: 40% of the length, then the -30 ms fade offset.
    working.prepareTrackForPreview(true);
    expect(t.looping).toBe(true);
    expect(t.restartPoint).toBe(Math.min(Math.max(Math.fround(0.4) * t.length - 30, 0), t.length));
  });

  it('compares audio and backgrounds by file content', async () => {
    const set = await importQuick();
    const [a, b] = set.beatmaps;

    expect(a.backgroundEquals(b)).toBe(true);
    expect(a.audioEquals(b)).toBe(true);
    expect(a.audioEquals(manager.defaultBeatmap.beatmapInfo)).toBe(true); // no audio file on either side (null == null)
  });

  it('loads a stored track behind its data and applies the preview point once it has loaded', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:test';

    try {
      const set = (await manager.importTask(new ImportTask(track('circles.osz'), 'circles.osz')))!;
      const working = manager.getWorkingBeatmap(set.beatmaps[0]);

      const t = working.loadTrack() as TrackWeb;
      expect(t).toBeInstanceOf(TrackWeb);
      expect(t.isLoaded).toBe(false);

      working.prepareTrackForPreview(false);
      t.restart();
      expect(t.isRunning).toBe(true);
      expect(play).not.toHaveBeenCalled();

      // the element reports its metadata
      const element = (t as unknown as { audio: HTMLAudioElement }).audio;
      let time = 0;
      Object.defineProperty(element, 'duration', { value: 60 });
      Object.defineProperty(element, 'currentTime', { get: () => time, set: v => { time = v; } });
      await new Promise(r => setTimeout(r, 10));
      element.dispatchEvent(new Event('loadedmetadata'));

      expect(t.isLoaded).toBe(true);
      // PreviewTime 45199 - 30
      expect(t.restartPoint).toBe(45169);
      expect(time).toBeCloseTo(45.169, 6);
      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      URL.createObjectURL = createObjectURL;
    }
  });
});

describe('BeatmapManager', () => {
  it('soft-deletes, queries and restores sets', async () => {
    const set = await importQuick();
    const intro = (await manager.importTask(new ImportTask(track('welcome.osz'), 'welcome.osz')))!;
    await manager.performWrite(intro, s => { s.isProtected = true; });

    expect(realm.findBeatmapSet(intro.id)!.isProtected).toBe(true);
    expect(manager.queryBeatmapSet(s => s.isProtected)!.id).toBe(intro.id);

    await manager.deleteAll();
    expect(realm.findBeatmapSet(set.id)!.deletePending).toBe(true);
    // protected sets are excluded from bulk deletion
    expect(realm.findBeatmapSet(intro.id)!.deletePending).toBe(false);
    expect(manager.getAllUsableBeatmapSets().map(s => s.id)).toEqual([intro.id]);

    expect(await manager.delete(set)).toBe(false);

    await manager.undeleteAll();
    expect(realm.findBeatmapSet(set.id)!.deletePending).toBe(false);
  });

  it('publishes new objects on every write, with change notifications', async () => {
    const changes: (ChangeSet | null)[] = [];
    const results: string[][] = [];

    realm.registerForNotifications(all => all.filter(s => !s.deletePending && !s.isProtected), (sender, c) => {
      changes.push(c);
      results.push(sender.map(s => s.id));
    });

    const set = await importQuick();
    const intro = (await manager.importTask(new ImportTask(track('circles.osz'), 'circles.osz')))!;
    await manager.performWrite(intro, s => { s.isProtected = true; });

    const before: BeatmapSetInfo = realm.findBeatmapSet(set.id)!;
    await realm.write(r => { r.edit(set).beatmaps[0].hidden = true; });

    expect(before.beatmaps[0].hidden).toBe(false);
    expect(realm.findBeatmapSet(set.id)).not.toBe(before);
    expect(realm.findBeatmapSet(set.id)!.beatmaps[0].hidden).toBe(true);

    await manager.delete(set);

    expect(changes).toEqual([
      null,
      { deletedIndices: [], insertedIndices: [0], newModifiedIndices: [] },
      { deletedIndices: [], insertedIndices: [1], newModifiedIndices: [] },
      // the intro set becoming protected leaves the query
      { deletedIndices: [1], insertedIndices: [], newModifiedIndices: [] },
      { deletedIndices: [], insertedIndices: [], newModifiedIndices: [0] },
      { deletedIndices: [0], insertedIndices: [], newModifiedIndices: [] },
    ]);
    expect(results.at(-1)).toEqual([]);
  });
});
