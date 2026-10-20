// Decodes every .osu file of the bundled osu-resources sets and the LukHash fixture: no line may fail to parse.

import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Beatmap, BeatmapExtensions } from '@game/beatmaps/Beatmap';
import { Decoder } from '@game/beatmaps/formats/Decoder';
import '@game/beatmaps/formats/LegacyBeatmapDecoder';
import { LineBufferedReader } from '@game/io/LineBufferedReader';

const archives = [
  ...['circles', 'triangles', 'welcome', 'christmas2024'].map(n => `_reference/osu-resources/osu.Game.Resources/Tracks/${n}.osz`),
  'tests/fixtures/1032103 LukHash - H8 U.osz',
];

afterEach(() => vi.restoreAllMocks());

describe.each(archives)('%s', archive => {
  const files = unzipSync(fs.readFileSync(path.resolve(archive)));
  const osuFiles = Object.keys(files).filter(f => f.toLowerCase().endsWith('.osu') && !f.includes('/'));

  it.each(osuFiles)('decodes %s without failed lines', name => {
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const stream = new LineBufferedReader(files[name]);
    const beatmap = Decoder.getDecoder(Beatmap, stream).decode(stream);

    expect(log.mock.calls.flat().filter(m => String(m).includes('Failed to process line'))).toEqual([]);
    expect(beatmap.beatmapVersion).toBeGreaterThan(0);
    expect(beatmap.metadata.title).not.toBe('Unknown');
    expect(beatmap.metadata.audioFile in files || Object.keys(files).some(f => f.toLowerCase() === beatmap.metadata.audioFile.toLowerCase())).toBe(true);
    expect(beatmap.controlPointInfo.timingPoints.length).toBeGreaterThan(0);
    expect(beatmap.getMostCommonBeatLength()).toBeGreaterThan(0);

    expect(BeatmapExtensions.calculatePlayableLength(beatmap)).toBeGreaterThanOrEqual(0);
  });
});
