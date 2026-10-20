// Ported from osu.Game.Tests/Beatmaps/Formats/LegacyBeatmapDecoderTest.cs (the cases that don't need ruleset converters, skins or the
// playable beatmap pipeline), plus ParsingTest.cs.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Vector2F } from '@fw/layout/Vector2F';
import { HitSampleInfo } from '@game/audio/HitSampleInfo';
import { BeatmapExtensions } from '@game/beatmaps/Beatmap';
import { Beatmap } from '@game/beatmaps/Beatmap';
import { CountdownType } from '@game/beatmaps/CountdownType';
import { Decoder } from '@game/beatmaps/formats/Decoder';
import { LegacyBeatmapDecoder } from '@game/beatmaps/formats/LegacyBeatmapDecoder';
import { LegacyBeatmapEncoder } from '@game/beatmaps/formats/LegacyBeatmapEncoder';
import { Parsing } from '@game/beatmaps/formats/Parsing';
import { LegacyControlPointInfo } from '@game/beatmaps/legacy/LegacyControlPointInfo';
import { TimeSignature } from '@game/beatmaps/timing/TimeSignature';
import { LineBufferedReader } from '@game/io/LineBufferedReader';
import { getEndTime, type HitObject } from '@game/rulesets/objects/HitObject';
import { ConvertSlider, type ConvertHitObject } from '@game/rulesets/objects/legacy/ConvertHitObjects';
import type { SliderPath } from '@game/rulesets/objects/SliderPath';
import { PathType } from '@game/rulesets/objects/types/PathType';

const openResource = (name: string) => new LineBufferedReader(fs.readFileSync(path.resolve('tests/fixtures/osu-tests', name)));

function decode(name: string, applyOffsets = false, version?: number): Beatmap {
  const decoder = new LegacyBeatmapDecoder(version);
  decoder.applyOffsets = applyOffsets;
  return decoder.decode(openResource(name));
}

const controlPointsOf = (beatmap: Beatmap) => beatmap.controlPointInfo as LegacyControlPointInfo;
const pathOf = (h: HitObject) => (h as ConvertSlider).path;
const position = (h: HitObject) => (h as ConvertHitObject).position;

describe('LegacyBeatmapDecoder', () => {
  it('decodes the beatmap version', () => {
    const stream = openResource('beatmap-version-6.osu');
    const beatmap = Decoder.getDecoder(Beatmap, stream).decode(stream);

    expect(beatmap.beatmapVersion).toBe(6);
    expect(beatmap.beatmapInfo.ruleset.name).not.toBe('null placeholder ruleset');
  });

  it.each([false, true])('ignores a -1 preview point with offsets applied: %s', applyOffsets => {
    const stream = openResource('beatmap-version-4.osu');
    const decoder = Decoder.getDecoder(Beatmap, stream) as LegacyBeatmapDecoder;
    decoder.applyOffsets = applyOffsets;
    const beatmap = decoder.decode(stream);

    expect(beatmap.beatmapVersion).toBe(4);
    expect(beatmap.beatmapInfo.metadata.previewTime).toBe(-1);
  });

  it('decodes [General]', () => {
    const beatmap = decode('Soleily - Renatus (Gamu) [Insane].osu');
    const metadata = beatmap.metadata;

    expect(metadata.audioFile).toBe('03. Renatus - Soleily 192kbps.mp3');
    expect(beatmap.audioLeadIn).toBe(0);
    expect(metadata.previewTime).toBe(164471);
    expect(beatmap.stackLeniency).toBe(Math.fround(0.7));
    expect(beatmap.beatmapInfo.ruleset.onlineID).toBe(0);
    expect(beatmap.letterboxInBreaks).toBe(false);
    expect(beatmap.specialStyle).toBe(false);
    expect(beatmap.widescreenStoryboard).toBe(false);
    expect(beatmap.samplesMatchPlaybackRate).toBe(false);
    expect(beatmap.countdown).toBe(CountdownType.None);
    expect(beatmap.countdownOffset).toBe(0);
  });

  it('decodes [Editor]', () => {
    const beatmap = decode('Soleily - Renatus (Gamu) [Insane].osu', true);

    expect(beatmap.bookmarks).toEqual([
      11505, 22054, 32604, 43153, 53703, 64252, 74802, 85351,
      95901, 106450, 116999, 119637, 130186, 140735, 151285,
      161834, 164471, 175020, 185570, 196119, 206669, 209306,
    ]);
    expect(beatmap.distanceSpacing).toBe(1.8);
    expect(beatmap.beatmapInfo.beatDivisor).toBe(4);
    expect(beatmap.gridSize).toBe(4);
    expect(beatmap.timelineZoom).toBe(2);
  });

  it('decodes [Metadata]', () => {
    const beatmap = decode('Soleily - Renatus (Gamu) [Insane].osu', true);
    const metadata = beatmap.metadata;

    expect(metadata.title).toBe('Renatus');
    expect(metadata.titleUnicode).toBe('Renatus');
    expect(metadata.artist).toBe('Soleily');
    expect(metadata.artistUnicode).toBe('Soleily');
    expect(metadata.author.username).toBe('Gamu');
    expect(beatmap.beatmapInfo.difficultyName).toBe('Insane');
    expect(metadata.source).toBe('');
    expect(metadata.tags).toBe('MBC7 Unisphere 地球ヤバイEP Chikyu Yabai');
    expect(beatmap.beatmapInfo.onlineID).toBe(557821);
    expect(beatmap.beatmapInfo.beatmapSet?.onlineID).toBe(241526);
  });

  it('decodes [Difficulty]', () => {
    const difficulty = decode('Soleily - Renatus (Gamu) [Insane].osu', true).difficulty;

    expect(difficulty.drainRate).toBe(6.5);
    expect(difficulty.circleSize).toBe(4);
    expect(difficulty.overallDifficulty).toBe(8);
    expect(difficulty.approachRate).toBe(9);
    expect(difficulty.sliderMultiplier).toBe(1.8);
    expect(difficulty.sliderTickRate).toBe(2);
  });

  it('decodes [Events]', () => {
    const beatmap = decode('Soleily - Renatus (Gamu) [Insane].osu');
    const breakPoint = beatmap.breaks.get(0);

    expect(beatmap.metadata.backgroundFile).toBe('machinetop_background.jpg');
    expect(breakPoint.startTime).toBe(122474);
    expect(breakPoint.endTime).toBe(140135);
    expect(breakPoint.hasEffect).toBe(true);
  });

  it.each(['video-with-lowercase-extension.osb', 'video-with-uppercase-extension.osb', 'image-specified-as-video.osb'])('treats %s correctly', name => {
    expect(decode(name).metadata.backgroundFile).toBe('BG.jpg');
  });

  it('decodes [TimingPoints]', () => {
    const controlPoints = controlPointsOf(decode('Soleily - Renatus (Gamu) [Insane].osu'));

    expect(controlPoints.timingPoints.length).toBe(4);
    expect(controlPoints.difficultyPoints.length).toBe(5);
    expect(controlPoints.samplePoints.length).toBe(34);
    expect(controlPoints.effectPoints.length).toBe(8);

    let timingPoint = controlPoints.timingPointAt(0);
    expect(timingPoint.time).toBe(956);
    expect(timingPoint.beatLength).toBe(329.67032967033);
    expect(timingPoint.timeSignature.equals(TimeSignature.SimpleQuadruple)).toBe(true);
    expect(timingPoint.omitFirstBarLine).toBe(false);

    timingPoint = controlPoints.timingPointAt(48428);
    expect(timingPoint.time).toBe(956);
    expect(timingPoint.beatLength).toBe(329.67032967033);

    timingPoint = controlPoints.timingPointAt(119637);
    expect(timingPoint.time).toBe(119637);
    expect(timingPoint.beatLength).toBe(659.340659340659);
    expect(timingPoint.timeSignature.equals(TimeSignature.SimpleQuadruple)).toBe(true);
    expect(timingPoint.omitFirstBarLine).toBe(false);

    let difficultyPoint = controlPoints.difficultyPointAt(0);
    expect(difficultyPoint.time).toBe(0);
    expect(difficultyPoint.sliderVelocity).toBe(1.0);

    difficultyPoint = controlPoints.difficultyPointAt(48428);
    expect(difficultyPoint.time).toBe(0);
    expect(difficultyPoint.sliderVelocity).toBe(1.0);

    difficultyPoint = controlPoints.difficultyPointAt(116999);
    expect(difficultyPoint.time).toBe(116999);
    expect(Math.abs(difficultyPoint.sliderVelocity - 0.75)).toBeLessThanOrEqual(0.1);

    let soundPoint = controlPoints.samplePointAt(0);
    expect(soundPoint.time).toBe(956);
    expect(soundPoint.sampleBank).toBe(HitSampleInfo.BANK_SOFT);
    expect(soundPoint.sampleVolume).toBe(60);

    soundPoint = controlPoints.samplePointAt(53373);
    expect(soundPoint.time).toBe(53373);
    expect(soundPoint.sampleBank).toBe(HitSampleInfo.BANK_SOFT);
    expect(soundPoint.sampleVolume).toBe(60);

    soundPoint = controlPoints.samplePointAt(119637);
    expect(soundPoint.time).toBe(119637);
    expect(soundPoint.sampleBank).toBe(HitSampleInfo.BANK_SOFT);
    expect(soundPoint.sampleVolume).toBe(80);

    let effectPoint = controlPoints.effectPointAt(0);
    expect(effectPoint.time).toBe(0);
    expect(effectPoint.kiaiMode).toBe(false);

    effectPoint = controlPoints.effectPointAt(53703);
    expect(effectPoint.time).toBe(53703);
    expect(effectPoint.kiaiMode).toBe(true);

    effectPoint = controlPoints.effectPointAt(116637);
    expect(effectPoint.time).toBe(95901);
    expect(effectPoint.kiaiMode).toBe(false);
  });

  it('decodes overlapping timing points', () => {
    const controlPoints = controlPointsOf(decode('overlapping-control-points.osu'));

    expect(controlPoints.timingPoints.length).toBe(4);
    expect(controlPoints.difficultyPoints.length).toBe(3);
    expect(controlPoints.effectPoints.length).toBe(3);
    expect(controlPoints.samplePoints.length).toBe(3);

    expect(controlPoints.difficultyPointAt(500).sliderVelocity).toBeCloseTo(1.5, 1);
    expect(controlPoints.difficultyPointAt(1500).sliderVelocity).toBeCloseTo(1.5, 1);
    expect(controlPoints.difficultyPointAt(2500).sliderVelocity).toBeCloseTo(0.75, 1);
    expect(controlPoints.difficultyPointAt(3500).sliderVelocity).toBeCloseTo(1.5, 1);

    expect(controlPoints.effectPointAt(500).kiaiMode).toBe(true);
    expect(controlPoints.effectPointAt(1500).kiaiMode).toBe(true);
    expect(controlPoints.effectPointAt(2500).kiaiMode).toBe(false);
    expect(controlPoints.effectPointAt(3500).kiaiMode).toBe(true);

    expect(controlPoints.samplePointAt(500).sampleBank).toBe(HitSampleInfo.BANK_DRUM);
    expect(controlPoints.samplePointAt(1500).sampleBank).toBe(HitSampleInfo.BANK_DRUM);
    expect(controlPoints.samplePointAt(2500).sampleBank).toBe(HitSampleInfo.BANK_NORMAL);
    expect(controlPoints.samplePointAt(3500).sampleBank).toBe(HitSampleInfo.BANK_DRUM);

    expect(controlPoints.timingPointAt(500).beatLength).toBeCloseTo(500, 1);
    expect(controlPoints.timingPointAt(1500).beatLength).toBeCloseTo(500, 1);
    expect(controlPoints.timingPointAt(2500).beatLength).toBeCloseTo(250, 1);
    expect(controlPoints.timingPointAt(3500).beatLength).toBeCloseTo(500, 1);
  });

  it('decodes the omit-first-barline effect', () => {
    const controlPoints = controlPointsOf(decode('omit-barline-control-points.osu'));

    expect(controlPoints.timingPoints.length).toBe(6);
    expect(controlPoints.effectPoints.length).toBe(0);

    expect([500, 1500, 2500, 3500, 4500, 5500].map(t => controlPoints.timingPointAt(t).omitFirstBarLine)).toEqual([false, true, false, false, false, true]);
  });

  it('resets the speed multiplier on a timing point', () => {
    const controlPoints = controlPointsOf(decode('timingpoint-speedmultiplier-reset.osu'));

    expect(controlPoints.difficultyPointAt(0).sliderVelocity).toBeCloseTo(0.5, 1);
    expect(controlPoints.difficultyPointAt(2000).sliderVelocity).toBeCloseTo(1, 1);
  });

  it('finds the last object time across concurrent objects', () => {
    const beatmap = decode('mania-last-object-not-latest.osu', true);
    const last = beatmap.hitObjects[beatmap.hitObjects.length - 1];

    expect(last.startTime).toBe(2494);
    expect(getEndTime(last)).toBe(2494);
    expect(BeatmapExtensions.getLastObjectTime(beatmap)).toBe(2582);
  });

  it('truncates legacy hit object coordinates', () => {
    expect(position(decode('hitobject-coordinates-legacy.osu', true).hitObjects[0]).equals(new Vector2F(256, 256))).toBe(true);
  });

  it('keeps lazer hit object coordinates as floats', () => {
    const p = position(decode('hitobject-coordinates-lazer.osu', true, LegacyBeatmapEncoder.FIRST_LAZER_VERSION).hitObjects[0]);
    expect(p.equals(new Vector2F(Math.fround(256.99853), Math.fround(256.001)))).toBe(true);
  });

  it('decodes [HitObjects]', () => {
    const hitObjects = decode('Soleily - Renatus (Gamu) [Insane].osu').hitObjects;

    expect(hitObjects[0]).toBeInstanceOf(ConvertSlider);
    expect(position(hitObjects[0]).equals(new Vector2F(192, 168))).toBe(true);
    expect(hitObjects[0].startTime).toBe(956);
    expect(hitObjects[0].samples.some(s => s.name === HitSampleInfo.HIT_NORMAL)).toBe(true);

    expect(position(hitObjects[1]).equals(new Vector2F(304, 56))).toBe(true);
    expect(hitObjects[1].startTime).toBe(1285);
    expect(hitObjects[1].samples.some(s => s.name === HitSampleInfo.HIT_CLAP)).toBe(true);
  });

  it('decodes difficulty control point changes', () => {
    const controlPointInfo = controlPointsOf(decode('controlpoint-difficulty-multiplier.osu'));

    expect(controlPointInfo.difficultyPointAt(5).sliderVelocity).toBe(1);
    expect(controlPointInfo.difficultyPointAt(1000).sliderVelocity).toBe(10);
    expect(controlPointInfo.difficultyPointAt(2000).sliderVelocity).toBe(1.8518518518518519);
    expect(controlPointInfo.difficultyPointAt(3000).sliderVelocity).toBe(0.5);
  });

  it('applies control point custom sample banks', () => {
    const hitObjects = decode('controlpoint-custom-samplebank.osu').hitObjects;
    const first = (h: HitObject) => h.samples[0].lookupNames[0];

    expect(first(hitObjects[0])).toBe('Gameplay/normal-hitnormal');
    expect(first(hitObjects[1])).toBe('Gameplay/normal-hitnormal');
    expect(first(hitObjects[2])).toBe('Gameplay/normal-hitnormal2');
    expect(first(hitObjects[3])).toBe('Gameplay/normal-hitnormal');

    // The fourth object is a slider: its samples are queried just beyond its start time, its node samples at each node.
    expect(first(hitObjects[4])).toBe('Gameplay/soft-hitnormal11');
    expect((hitObjects[4] as ConvertSlider).nodeSamples[0][0].lookupNames[0]).toBe('Gameplay/soft-hitnormal11');
    expect((hitObjects[4] as ConvertSlider).nodeSamples[1][0].lookupNames[0]).toBe('Gameplay/soft-hitnormal8');
  });

  it('decodes hit object custom sample banks', () => {
    const hitObjects = decode('hitobject-custom-samplebank.osu').hitObjects;

    expect(hitObjects.map(h => h.samples[0].lookupNames[0])).toEqual(['Gameplay/normal-hitnormal', 'Gameplay/normal-hitnormal2', 'Gameplay/normal-hitnormal3']);
  });

  it('decodes hit object file samples', () => {
    const hitObjects = decode('hitobject-file-samples.osu').hitObjects;

    expect(hitObjects[0].samples[0].lookupNames[0]).toBe('hit_1.wav');
    expect(hitObjects[1].samples[0].lookupNames[0]).toBe('hit_2.wav');
    expect(hitObjects[2].samples[0].lookupNames[0]).toBe('Gameplay/normal-hitnormal2');
    expect(hitObjects[3].samples[0].lookupNames[0]).toBe('hit_1.wav');
    expect(hitObjects[3].samples[0].volume).toBe(70);
  });

  it('decodes slider node samples', () => {
    const hitObjects = decode('slider-samples.osu').hitObjects;
    const names = (h: HitObject) => (h as ConvertSlider).nodeSamples.map(n => n.map(s => s.name));

    expect(names(hitObjects[0])).toEqual([[HitSampleInfo.HIT_NORMAL], [HitSampleInfo.HIT_NORMAL], [HitSampleInfo.HIT_NORMAL]]);
    expect(names(hitObjects[1])).toEqual([
      [HitSampleInfo.HIT_NORMAL, HitSampleInfo.HIT_CLAP], [HitSampleInfo.HIT_NORMAL, HitSampleInfo.HIT_CLAP], [HitSampleInfo.HIT_NORMAL, HitSampleInfo.HIT_CLAP],
    ]);
    expect(names(hitObjects[2])).toEqual([
      [HitSampleInfo.HIT_NORMAL, HitSampleInfo.HIT_WHISTLE], [HitSampleInfo.HIT_NORMAL], [HitSampleInfo.HIT_NORMAL, HitSampleInfo.HIT_CLAP],
    ]);
  });

  it('uses the normal bank for additions without a bank', () => {
    const hitObjects = decode('hitobject-no-addition-bank.osu').hitObjects;
    expect(hitObjects[0].samples[0].bank).toBe(hitObjects[0].samples[1].bank);
  });

  it('survives invalid events', () => {
    expect(() => decode('invalid-events.osu')).not.toThrow();
  });

  it('defaults invalid banks to normal', () => {
    const hitObjects = decode('invalid-bank.osu').hitObjects;
    const banks = (h: HitObject) => h.samples.slice(0, 2).map(s => s.bank);
    const { BANK_DRUM: D, BANK_NORMAL: N, BANK_SOFT: S } = HitSampleInfo;

    expect(hitObjects.slice(0, 5).map(h => h.samples[0].bank)).toEqual([D, N, S, D, N]);
    expect(hitObjects.slice(5, 10).map(banks)).toEqual([[D, D], [D, N], [D, S], [D, D], [D, N]]);
  });

  it.each([
    ['corrupted-header.osu', 'Beatmap with corrupted header', 'Evil Hacker'],
    ['missing-header.osu', 'Beatmap with no header', 'Incredibly Evil Hacker'],
    ['empty-lines-at-start.osu', 'Empty lines at start', 'Edge Case Hunter'],
    ['empty-line-instead-of-header.osu', 'The dog ate the file header', 'Why does this keep happening'],
    ['no-empty-line-after-header.osu', 'No empty line delimiting header from contents', 'Edge Case Hunter'],
  ])('finds a decoder for %s', (name, title, author) => {
    const stream = openResource(name);
    const decoder = Decoder.getDecoder(Beatmap, stream);
    expect(decoder).toBeInstanceOf(LegacyBeatmapDecoder);

    const beatmap = decoder.decode(stream);
    expect(beatmap.metadata.title).toBe(title);
    expect(beatmap.metadata.author.username).toBe(author);
  });

  it('throws for an empty file', () => {
    expect(() => Decoder.getDecoder(Beatmap, new LineBufferedReader(new Uint8Array()))).toThrow('Unknown file format (no content)');
  });

  it('decodes multi-segment sliders', () => {
    const decoded = decode('multi-segment-slider.osu');
    const expectPoints = (path: SliderPath, points: [number, number, PathType | null][]) => {
      points.forEach(([x, y, type], i) => {
        const p = path.controlPoints.get(i);
        expect(p.position.equals(new Vector2F(x, y)), `point ${i} position`).toBe(true);
        expect(PathType.equals(p.type, type), `point ${i} type`).toBe(true);
      });
    };

    // Multi-segment
    expectPoints(pathOf(decoded.hitObjects[0]), [
      [0, 0, PathType.PERFECT_CURVE], [161, -244, null], [376, -3, PathType.BEZIER], [68, 15, null], [259, -132, null], [92, -107, null],
    ]);

    // Single-segment
    expectPoints(pathOf(decoded.hitObjects[1]), [[0, 0, PathType.PERFECT_CURVE], [161, -244, null], [376, -3, null]]);

    // Implicit multi-segment
    expectPoints(pathOf(decoded.hitObjects[2]), [
      [0, 0, PathType.BEZIER], [0, 192, null], [224, 192, null], [224, 0, PathType.BEZIER], [224, -192, null], [480, -192, null], [480, 0, null],
    ]);

    // Last control point duplicated
    expectPoints(pathOf(decoded.hitObjects[3]), [[0, 0, PathType.BEZIER], [1, 1, null], [2, 2, null], [3, 3, null], [3, 3, null]]);

    // Last control point in segment duplicated
    expectPoints(pathOf(decoded.hitObjects[4]), [
      [0, 0, PathType.BEZIER], [1, 1, null], [2, 2, null], [3, 3, null], [3, 3, null], [4, 4, PathType.BEZIER], [5, 5, null],
    ]);

    // Implicit perfect-curve multi-segment (Should convert to bezier to match stable)
    expectPoints(pathOf(decoded.hitObjects[5]), [[0, 0, PathType.BEZIER], [75, 145, null], [170, 75, PathType.BEZIER], [300, 145, null], [410, 20, null]]);

    // Explicit perfect-curve multi-segment (Should not convert to bezier)
    expectPoints(pathOf(decoded.hitObjects[6]), [
      [0, 0, PathType.PERFECT_CURVE], [75, 145, null], [170, 75, PathType.PERFECT_CURVE], [300, 145, null], [410, 20, null],
    ]);
  });

  it('does not extend a slider past a duplicated last position', () => {
    const path = pathOf(decode('duplicate-last-position-slider.osu').hitObjects[0]);

    expect(path.expectedDistance.value).toBe(2);
    expect(path.distance).toBe(1);
  });

  it.each([false, true])('preserves legacy defaults for an empty file (offsets: %s)', applyOffsets => {
    const decoder = new LegacyBeatmapDecoder();
    decoder.applyOffsets = applyOffsets;
    const decoded = decoder.decode(new LineBufferedReader(new Uint8Array()));

    expect(decoded.audioLeadIn).toBe(0);
    expect(decoded.stackLeniency).toBe(Math.fround(0.7));
    expect(decoded.specialStyle).toBe(false);
    expect(decoded.letterboxInBreaks).toBe(false);
    expect(decoded.widescreenStoryboard).toBe(false);
    expect(decoded.epilepsyWarning).toBe(false);
    expect(decoded.samplesMatchPlaybackRate).toBe(false);
    expect(decoded.countdown).toBe(CountdownType.None);
    expect(decoded.countdownOffset).toBe(0);
    expect(decoded.beatmapInfo.metadata.previewTime).toBe(-1);
    expect(decoded.beatmapInfo.ruleset.onlineID).toBe(0);
  });

  it.each([
    ['undefined-approach-rate.osu', 1, 1],
    ['approach-rate-before-overall-difficulty.osu', 9, 1],
    ['approach-rate-after-overall-difficulty.osu', 9, 1],
  ])('resolves the approach rate of %s', (name, ar, od) => {
    const decoded = decode(name);
    expect(decoded.difficulty.approachRate).toBe(ar);
    expect(decoded.difficulty.overallDifficulty).toBe(od);
  });

  it('merges legacy adjacent implicit catmull segments', () => {
    const controlPoints = pathOf(decode('adjacent-catmull-segments.osu').hitObjects[0]).controlPoints.toArray();

    expect(controlPoints.length).toBe(6);
    const typed = controlPoints.filter(c => c.type !== null);
    expect(typed.length).toBe(1);
    expect(PathType.equals(typed[0].type, PathType.CATMULL)).toBe(true);
  });

  it('does not merge non-legacy adjacent implicit catmull segments', () => {
    const controlPoints = pathOf(decode('adjacent-catmull-segments.osu', false, LegacyBeatmapEncoder.FIRST_LAZER_VERSION).hitObjects[0]).controlPoints.toArray();

    expect(controlPoints.length).toBe(4);
    expect(controlPoints.map(c => c.type?.toString() ?? null)).toEqual([PathType.CATMULL, PathType.CATMULL, PathType.CATMULL, null].map(t => t?.toString() ?? null));
  });

  it('merges a legacy duplicate initial catmull point', () => {
    const controlPoints = pathOf(decode('catmull-duplicate-initial-controlpoint.osu').hitObjects[0]).controlPoints.toArray();

    expect(controlPoints.length).toBe(4);
    expect(PathType.equals(controlPoints[0].type, PathType.CATMULL)).toBe(true);
    expect(controlPoints[0].position.equals(Vector2F.Zero)).toBe(true);
    expect(controlPoints[1].type).toBeNull();
    expect(controlPoints[1].position.equals(Vector2F.Zero)).toBe(false);
  });

  it('handles NaN control points', () => {
    const controlPoints = controlPointsOf(decode('nan-control-points.osu'));

    expect(controlPoints.timingPoints.length).toBe(1);
    expect(controlPoints.difficultyPoints.length).toBe(2);

    expect(controlPoints.timingPointAt(1000).beatLength).toBe(500);

    expect(controlPoints.difficultyPointAt(2000).sliderVelocity).toBe(1);
    expect(controlPoints.difficultyPointAt(3000).sliderVelocity).toBe(1);

    expect(controlPoints.difficultyPointAt(2000).generateTicks).toBe(false);
    expect(controlPoints.difficultyPointAt(3000).generateTicks).toBe(true);
  });

  it('applies sample point leniency', () => {
    const hitObjects = decode('sample-point-leniency.osu').hitObjects;
    expect(hitObjects.length).toBe(1);
    expect(hitObjects[0].samples.every(s => s.volume === 70)).toBe(true);
  });

  it('starts a new combo after a break', () => {
    const hitObjects = decode('break-between-objects.osu').hitObjects as ConvertHitObject[];
    expect(hitObjects.slice(0, 3).map(h => h.newCombo)).toEqual([true, true, false]);
  });

  it('clamps difficulty settings', () => {
    const decoded = decode('out-of-range-difficulties.osu').difficulty;
    expect(decoded.drainRate).toBe(10);
    expect(decoded.circleSize).toBe(10);
    expect(decoded.overallDifficulty).toBe(10);
    expect(decoded.approachRate).toBe(10);
    expect(decoded.sliderMultiplier).toBe(3.6);
    expect(decoded.sliderTickRate).toBe(8);
  });

  it('clamps mania circle size to the key count range', () => {
    expect(decode('out-of-range-difficulties-mania.osu').difficulty.circleSize).toBe(14);
  });
});

describe('Parsing', () => {
  it('handles NaN', () => {
    expect(Parsing.parseFloat('NaN', Parsing.MAX_PARSE_VALUE, true)).toBeNaN();
    expect(Parsing.parseDouble('NaN', Parsing.MAX_PARSE_VALUE, true)).toBeNaN();
    expect(() => Parsing.parseFloat('NaN')).toThrow();
    expect(() => Parsing.parseDouble('NaN')).toThrow();
  });

  it('throws on bad strings', () => {
    expect(() => Parsing.parseInt('Random string 123')).toThrow();
    expect(() => Parsing.parseFloat('Random string 123')).toThrow();
    expect(() => Parsing.parseDouble('Random string 123')).toThrow();
  });

  it.each([[Parsing.MAX_PARSE_VALUE], [-1], [0], [1], [-Parsing.MAX_PARSE_VALUE], [10, 10], [-10, 10]])('parses %d within range', (input, limit = Parsing.MAX_PARSE_VALUE) => {
    expect(Parsing.parseInt(String(input), limit)).toBe(input);
    expect(Parsing.parseFloat(String(input), Math.fround(limit))).toBe(Math.fround(input));
    expect(Parsing.parseDouble(String(input), limit)).toBe(input);
  });

  it.each([['Infinity'], ['-Infinity'], ['999999999999'], [String(Parsing.MAX_PARSE_VALUE * 1.1)], [String(-Parsing.MAX_PARSE_VALUE * 1.1)], ['11', 10], ['-11', 10]])('rejects %s out of range', (input, limit = Parsing.MAX_PARSE_VALUE) => {
    expect(() => Parsing.parseInt(input, limit)).toThrow();
    expect(() => Parsing.parseFloat(input, Math.fround(limit))).toThrow();
    expect(() => Parsing.parseDouble(input, limit)).toThrow();
  });
});
