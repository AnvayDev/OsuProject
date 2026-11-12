// Ported from osu.Game/Beatmaps/BeatmapConverter.cs and IBeatmapConverter.cs

import { Signal } from '@fw/bindables/Signal';
import { SortedList } from '@fw/lists/SortedList';
import type { HitObject } from '../rulesets/objects/HitObject';
import { Beatmap, type IBeatmap } from './Beatmap';
import type { BreakPeriod } from './timing/BreakPeriod';

/** Provides functionality to convert a IBeatmap for a Ruleset. */
export interface IBeatmapConverter {
  /** Invoked when a HitObject has been converted. The first argument contains the HitObject that was converted. The second argument contains the HitObjects that were output from the conversion process. */
  readonly objectConverted: Signal<[HitObject, readonly HitObject[]]>;

  readonly beatmap: IBeatmap;

  /** Whether beatmap can be converted by this IBeatmapConverter. */
  canConvert(): boolean;

  /** Converts beatmap. */
  convert(): IBeatmap;
}

/** Converts a Beatmap for another mode. */
export abstract class BeatmapConverter<T extends HitObject> implements IBeatmapConverter {
  readonly objectConverted = new Signal<[HitObject, readonly HitObject[]]>();

  constructor(readonly beatmap: IBeatmap) {
  }

  /** Whether beatmap can be converted by this BeatmapConverter. */
  abstract canConvert(): boolean;

  /** Converts beatmap. */
  convert(): IBeatmap {
    // We always operate on a clone of the original beatmap, to not modify it game-wide
    const original = this.beatmap.clone();

    // Shallow clone isn't enough to ensure we don't mutate beatmap info unexpectedly.
    // Can potentially be removed after `Beatmap.Difficulty` doesn't save back to `Beatmap.BeatmapInfo`.
    original.beatmapInfo = original.beatmapInfo.clone();
    original.controlPointInfo = original.controlPointInfo.deepClone();

    // Used in osu!mania conversion.
    original.breaks = new SortedList<BreakPeriod>((x, y) => x.compareTo(y));
    for (const b of this.beatmap.breaks.toArray())
      original.breaks.add(b);

    return this.convertBeatmap(original);
  }

  /** Performs the conversion of a Beatmap using this Beatmap Converter. */
  protected convertBeatmap(original: IBeatmap): Beatmap<T> {
    const beatmap = this.createBeatmap();

    beatmap.beatmapInfo = original.beatmapInfo;
    beatmap.controlPointInfo = original.controlPointInfo;
    // (OrderBy is a stable sort, as Array.prototype.sort is.)
    beatmap.hitObjects = this.convertHitObjects(original.hitObjects, original).sort((a, b) => a.startTime - b.startTime);
    beatmap.breaks = original.breaks;
    beatmap.audioLeadIn = original.audioLeadIn;
    beatmap.stackLeniency = original.stackLeniency;
    beatmap.specialStyle = original.specialStyle;
    beatmap.letterboxInBreaks = original.letterboxInBreaks;
    beatmap.widescreenStoryboard = original.widescreenStoryboard;
    beatmap.epilepsyWarning = original.epilepsyWarning;
    beatmap.samplesMatchPlaybackRate = original.samplesMatchPlaybackRate;
    beatmap.distanceSpacing = original.distanceSpacing;
    beatmap.gridSize = original.gridSize;
    beatmap.timelineZoom = original.timelineZoom;
    beatmap.countdown = original.countdown;
    beatmap.countdownOffset = original.countdownOffset;
    beatmap.bookmarks = original.bookmarks;
    beatmap.sliderVelocityPresets = original.sliderVelocityPresets;
    beatmap.beatmapVersion = original.beatmapVersion;

    return beatmap;
  }

  private convertHitObjects(hitObjects: readonly HitObject[], beatmap: IBeatmap): T[] {
    const result: T[] = [];

    for (const obj of hitObjects) {
      if (this.isConverted(obj)) {
        result.push(obj);
        continue;
      }

      const converted = [...this.convertHitObject(obj, beatmap)];

      this.objectConverted.emit([obj, converted]);

      for (const c of converted) {
        if (c !== null)
          result.push(c);
      }
    }

    return result;
  }

  /** Whether a hit object already is of the type converted to (`obj is T` in C#), and so is kept as it is. */
  protected abstract isConverted(obj: HitObject): obj is T;

  /** Creates the Beatmap that will be returned by this BeatmapConverter. */
  protected createBeatmap(): Beatmap<T> {
    return new Beatmap<T>();
  }

  /** Performs the conversion of a hit object. This method is generally executed sequentially for all objects in a beatmap. */
  protected convertHitObject(_original: HitObject, _beatmap: IBeatmap): Iterable<T> {
    return [];
  }
}
