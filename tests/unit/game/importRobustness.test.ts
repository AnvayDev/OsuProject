import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { AudioManager } from '@fw/audio/AudioManager';
import { ResourceStore } from '@fw/io/ResourceStore';
import { AudioThread } from '@fw/platform/AudioThread';
import { BeatmapManager } from '@game/beatmaps/BeatmapManager';
import { DummyWorkingBeatmap } from '@game/beatmaps/DummyWorkingBeatmap';
import '@game/beatmaps/formats/LegacyBeatmapDecoder';
import { ImportTask } from '@game/database/ImportTask';
import { RealmAccess } from '@game/database/RealmAccess';
import { ZipArchiveReader } from '@game/io/archives/ZipArchiveReader';

function fakeNode(): AudioNode {
  const node = { connect: () => node, disconnect: () => {}, gain: { value: 1 }, pan: { value: 0 } };
  return node as unknown as AudioNode;
}

const context = { destination: fakeNode(), createGain: fakeNode, createStereoPanner: fakeNode, createMediaElementSource: fakeNode } as unknown as BaseAudioContext;

const osu = (version: string, audio: string) => strToU8(`osu file format v14

[General]
AudioFilename: ${audio}
Mode: 0

[Metadata]
Title:Robust
Artist:Test
Creator:Claude
Version:${version}
BeatmapID:0
BeatmapSetID:-1

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:5
ApproachRate:5
SliderMultiplier:1.4
SliderTickRate:1

[TimingPoints]
0,500,4,2,0,60,1,0

[HitObjects]
256,192,1000,1,0,0:0:0:0:
`);

const osz = (files: Record<string, Uint8Array>) => zipSync(files, { level: 0 });

let dbCounter = 0;
let dbName: string;
let realm: RealmAccess;
let manager: BeatmapManager;

const createManager = (r: RealmAccess) => {
  const audio = new AudioManager(new AudioThread(), new ResourceStore(), new ResourceStore(), null, context);
  return new BeatmapManager(r, audio, new DummyWorkingBeatmap(audio, null));
};

beforeEach(async () => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('AudioContext', class {});

  realm = await RealmAccess.open(dbName = `robustness-test-${dbCounter++}`);
  manager = createManager(realm);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('import robustness (web addition)', () => {
  it('fails to import a set whose audio was removed, so a failed download leaves nothing behind', async () => {
    const imported = await manager.import([new ImportTask(osz({ 'a.osu': osu('Easy', 'audio.mp3') }), 'dmca.osz')]);

    expect(imported).toHaveLength(0);
    expect(realm.allBeatmapSets()).toHaveLength(0);
  });

  it('keeps only the difficulties whose audio is present', async () => {
    const imported = await manager.import([new ImportTask(osz({
      'a.osu': osu('Easy', 'audio.mp3'),
      'b.osu': osu('Hard', 'other.mp3'),
      'audio.mp3': new Uint8Array([1, 2, 3]),
    }), 'partial.osz')]);

    expect(imported).toHaveLength(1);
    expect(imported[0].beatmaps.map(b => b.difficultyName)).toEqual(['Easy']);
  });

  it('rejects archive entries whose CRC does not match (a damaged download)', () => {
    const data = osz({ 'a.osu': osu('Easy', 'audio.mp3'), 'audio.mp3': new Uint8Array(64).fill(7) });

    // stored (level 0): the audio bytes appear verbatim, so damage one of them.
    const at = data.findIndex((_, i) => data.subarray(i, i + 64).every(b => b === 7));
    data[at + 10] = 8;

    const reader = new ZipArchiveReader(data, 'damaged.osz');
    expect(() => reader.getStream('audio.mp3')).toThrow(/CRC/);
    expect(reader.getStream('a.osu')).not.toBeNull();
  });

  it('removes stored sets with missing files on startup', async () => {
    const [set] = await manager.import([new ImportTask(osz({ 'a.osu': osu('Easy', 'audio.mp3'), 'audio.mp3': new Uint8Array([4, 5, 6]) }), 'ok.osz')]);
    expect(realm.allBeatmapSets()).toHaveLength(1);

    // the audio file disappears from storage (an interrupted write, or evicted storage)
    await realm.db.delete('files', set.getPathForFile('audio.mp3')!);
    realm.db.close();

    const reopened = await RealmAccess.open(dbName);
    expect(reopened.allBeatmapSets()).toHaveLength(0);
  });
});
