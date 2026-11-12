// Ported from osu.Game.Rulesets.Osu.Tests/OsuBeatmapConversionTest.cs and osu.Game/Tests/Beatmaps/BeatmapConversionTest.cs.
// Each beatmap is converted to the osu! ruleset through WorkingBeatmap.getPlayableBeatmap and compared with the client's expected output
// (start time, end time and stacked position of every hit object and nested slider object).

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Beatmap, type IBeatmap } from '@game/beatmaps/Beatmap';
import type { IBeatmapConverter } from '@game/beatmaps/BeatmapConverter';
import { Decoder } from '@game/beatmaps/formats/Decoder';
// (a value import: the module registers the decoder with Decoder)
import { LegacyBeatmapDecoder } from '@game/beatmaps/formats/LegacyBeatmapDecoder';
import { WorkingBeatmap } from '@game/beatmaps/WorkingBeatmap';
import { LineBufferedReader } from '@game/io/LineBufferedReader';
import { getEndTime, type HitObject } from '@game/rulesets/objects/HitObject';
import { SliderEventGenerator } from '@game/rulesets/objects/SliderEventGenerator';
import type { OsuHitObject } from '@game/rulesets/osu/objects/OsuHitObject';
import { Slider } from '@game/rulesets/osu/objects/Slider';
import { SliderTailCircle } from '@game/rulesets/osu/objects/SliderTailCircle';
import '@game/rulesets/osu/OsuRuleset';
import type { Ruleset } from '@game/rulesets/Ruleset';
import { RulesetInfo, RulesetStore } from '@game/rulesets/RulesetInfo';

const resource = (name: string) => path.resolve('tests/fixtures/osu-tests/osu-ruleset', name);

interface ConvertValue { StartTime: number; EndTime: number; X: number; Y: number }
interface ConvertMapping { StartTime: number; Objects: ConvertValue[] }

/**
 * ConvertValue.Equals: Precision.AlmostEquals with a lenience of 2. The expected files come from osu-stable, which truncates times to whole
 * milliseconds and approximates paths slightly differently; measured against them the port is off by at most 1.0 ms and 0.33 px.
 */
const conversion_lenience = 2;

class ConversionWorkingBeatmap extends WorkingBeatmap {
  conversionGenerated: ((original: HitObject, result: readonly HitObject[]) => void) | null = null;

  constructor(private readonly decoded: IBeatmap) {
    super(decoded.beatmapInfo, null!);
  }

  protected override getBeatmap(): Promise<IBeatmap | null> { return Promise.resolve(this.decoded); }
  override getBackground(): never { throw new Error('not implemented'); }
  protected override getBeatmapTrack(): never { throw new Error('not implemented'); }
  override getStream(): never { throw new Error('not implemented'); }

  protected override createBeatmapConverter(beatmap: IBeatmap, ruleset: Ruleset): IBeatmapConverter {
    const converter = super.createBeatmapConverter(beatmap, ruleset);
    converter.objectConverted.add(([original, converted]) => this.conversionGenerated?.(original, converted));
    return converter;
  }
}

function getBeatmap(name: string): Beatmap {
  const stream = new LineBufferedReader(fs.readFileSync(resource(`${name}.osu`)));
  const decoder = Decoder.getDecoder(Beatmap, stream);
  if (!(decoder instanceof LegacyBeatmapDecoder)) throw new Error('expected a legacy beatmap');
  decoder.applyOffsets = false;

  const beatmap = decoder.decode(stream);
  const osu = RulesetStore.getRuleset(0)!;

  beatmap.beatmapInfo.ruleset = beatmap.beatmapInfo.ruleset.onlineID === osu.onlineID ? osu : new RulesetInfo();
  return beatmap;
}

function createConvertValue(obj: OsuHitObject, parent: OsuHitObject | null = null): ConvertValue {
  let startTime = obj.startTime;
  let endTime = getEndTime(obj);

  // this is locally bringing back the stable treatment of the "legacy last tick"
  // just to make sure that the conversion output matches.
  // compare: `SliderEventGenerator.Generate()`, and the calculation of `legacyLastTickTime`.
  if (obj instanceof SliderTailCircle && parent instanceof Slider) {
    startTime = Math.max(startTime + SliderEventGenerator.TAIL_LENIENCY, parent.startTime + parent.duration / 2);
    endTime = Math.max(endTime + SliderEventGenerator.TAIL_LENIENCY, parent.startTime + parent.duration / 2);
  }

  return { StartTime: startTime, EndTime: endTime, X: obj.stackedPosition.x, Y: obj.stackedPosition.y };
}

function createConvertValues(hitObject: HitObject): ConvertValue[] {
  if (hitObject instanceof Slider)
    return hitObject.nestedHitObjects.map(nested => createConvertValue(nested as OsuHitObject, hitObject));

  return [createConvertValue(hitObject as OsuHitObject)];
}

async function convert(name: string): Promise<ConvertMapping[]> {
  const beatmap = getBeatmap(name);

  const converterResult = new Map<HitObject, readonly HitObject[]>();
  const working = new ConversionWorkingBeatmap(beatmap);
  working.conversionGenerated = (o, r) => converterResult.set(o, r);

  await working.loadBeatmapAsync();
  working.getPlayableBeatmap(RulesetStore.getRuleset(0)!);

  return [...converterResult].map(([original, converted]) => ({ StartTime: original.startTime, Objects: converted.flatMap(createConvertValues) }));
}

describe('OsuBeatmapConverter', () => {
  it.each([
    'basic',
    'colinear-perfect-curve',
    'slider-ticks',
    'slider-ticks-edge-case',
    'slider-paths-edge-case',
    'repeat-slider',
    'uneven-repeat-slider',
    'old-stacking',
    'multi-segment-slider',
    'nan-slider',
    '1124896',
    '1341554',
    '2593923',
    '801165',
  ])('converts %s as the client does', async name => {
    const ours = await convert(name);
    const expected = (JSON.parse(fs.readFileSync(resource(`${name}-expected-conversion.json`), 'utf8')) as { Mappings: ConvertMapping[] }).Mappings;

    expect(ours.length).toBe(expected.length);

    for (let m = 0; m < expected.length; m++) {
      expect(ours[m].StartTime, `mapping ${m}`).toBe(expected[m].StartTime);
      expect(ours[m].Objects.length, `objects of the hit object at ${expected[m].StartTime}`).toBe(expected[m].Objects.length);

      for (let o = 0; o < expected[m].Objects.length; o++) {
        for (const key of ['StartTime', 'EndTime', 'X', 'Y'] as const) {
          const difference = Math.abs(ours[m].Objects[o][key] - expected[m].Objects[o][key]);
          expect(difference, `${key} of object ${o} of the hit object at ${expected[m].StartTime}: ${ours[m].Objects[o][key]} vs ${expected[m].Objects[o][key]}`).toBeLessThanOrEqual(conversion_lenience);
        }
      }
    }
  });
});
