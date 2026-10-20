// Ported from osu.Game/Beatmaps/Beatmap.cs and IBeatmap.cs (BeatmapExtensions without GetMaxCombo, which needs judgements; GetStatistics is
// not ported yet).

import { SortedList } from '@fw/lists/SortedList';
import { mathRound } from '@fw/utils/DotNet';
import type { HitObject } from '../rulesets/objects/HitObject';
import { getEndTime } from '../rulesets/objects/HitObject';
import { BeatmapDifficulty } from './BeatmapDifficulty';
import { BeatmapInfo } from './BeatmapInfo';
import { BeatmapMetadata } from './BeatmapMetadata';
import { ControlPointInfo } from './controlPoints/ControlPointInfo';
import { TimingControlPoint } from './controlPoints/TimingControlPoint';
import { CountdownType } from './CountdownType';
import { LegacyBeatmapEncoder } from './formats/LegacyBeatmapEncoder';
import type { BreakPeriod } from './timing/BreakPeriod';

/** A materialised beatmap. */
export interface IBeatmap<T extends HitObject = HitObject> {
  /** This beatmap's info. */
  beatmapInfo: BeatmapInfo;

  /** This beatmap's metadata. */
  readonly metadata: BeatmapMetadata;

  /** This beatmap's difficulty settings. */
  difficulty: BeatmapDifficulty;

  /** The control points in this beatmap. */
  controlPointInfo: ControlPointInfo;

  /** The breaks in this beatmap. */
  breaks: SortedList<BreakPeriod>;

  /** Total amount of break time in the beatmap. */
  readonly totalBreakTime: number;

  /** The hitobjects contained by this beatmap. */
  readonly hitObjects: readonly T[];

  /** Finds the most common beat length represented by the control points in this beatmap. */
  getMostCommonBeatLength(): number;

  audioLeadIn: number;
  stackLeniency: number;
  specialStyle: boolean;
  letterboxInBreaks: boolean;
  widescreenStoryboard: boolean;
  epilepsyWarning: boolean;
  samplesMatchPlaybackRate: boolean;

  /**
   * The ratio of distance travelled per time unit.
   * Generally used to decouple the spacing between hit objects from the enforced "velocity" of the beatmap (see DifficultyControlPoint.sliderVelocity).
   */
  distanceSpacing: number;

  gridSize: number;
  timelineZoom: number;
  countdown: CountdownType;

  /** The number of beats to move the countdown backwards (compared to its default location). */
  countdownOffset: number;

  bookmarks: number[];
  sliderVelocityPresets: number[];
  readonly beatmapVersion: number;

  /** Creates a shallow-clone of this beatmap and returns it. */
  clone(): IBeatmap<T>;
}

export class Beatmap<T extends HitObject = HitObject> implements IBeatmap<T> {
  private _difficulty = new BeatmapDifficulty();

  get difficulty(): BeatmapDifficulty {
    return this._difficulty;
  }

  set difficulty(value: BeatmapDifficulty) {
    this._difficulty = value;

    this._beatmapInfo.difficulty = this._difficulty.clone();
  }

  private _beatmapInfo: BeatmapInfo;

  get beatmapInfo(): BeatmapInfo {
    return this._beatmapInfo;
  }

  set beatmapInfo(value: BeatmapInfo) {
    this._beatmapInfo = value;

    this.difficulty = this._beatmapInfo.difficulty.clone();
  }

  constructor() {
    this._beatmapInfo = new BeatmapInfo(null, this.difficulty, BeatmapMetadata.from({
      artist: 'Unknown',
      title: 'Unknown',
      author: { username: 'Unknown Creator' },
    }));
    this._beatmapInfo.difficultyName = 'Normal';
  }

  get metadata(): BeatmapMetadata {
    return this.beatmapInfo.metadata;
  }

  controlPointInfo = new ControlPointInfo();

  breaks = new SortedList<BreakPeriod>((x, y) => x.compareTo(y));

  get totalBreakTime(): number {
    return this.breaks.toArray().reduce((sum, b) => sum + b.duration, 0);
  }

  hitObjects: T[] = [];

  getMostCommonBeatLength(): number {
    let lastTime: number;

    const timingPoints = this.controlPointInfo.timingPoints;

    // The last playable time in the beatmap - the last timing point extends to this time.
    // Note: This is more accurate and may present different results because osu-stable didn't have the ability to calculate slider durations in this context.
    if (this.hitObjects.length === 0)
      lastTime = timingPoints.length > 0 ? timingPoints[timingPoints.length - 1].time : 0;
    else
      lastTime = BeatmapExtensions.getLastObjectTime(this);

    // Aggregate durations into a set of (beatLength, duration) tuples for each beat length (GroupBy keeps the order of first appearance).
    const durations = new Map<number, number>();

    timingPoints.forEach((t, i) => {
      // Construct a (beatLength, duration) tuple for each individual timing point.
      let duration = 0;

      if (t.time <= lastTime) {
        // osu-stable forced the first control point to start at 0.
        // This is reproduced here to maintain compatibility around osu!mania scroll speed and song select display.
        const currentTime = i === 0 ? 0 : t.time;
        const nextTime = i === timingPoints.length - 1 ? lastTime : timingPoints[i + 1].time;

        duration = nextTime - currentTime;
      }

      // Rounding is applied here (to 1e-3 milliseconds) to neutralise potential effects of floating point inaccuracies
      const key = mathRound(t.beatLength * 1000) / 1000;
      durations.set(key, (durations.get(key) ?? 0) + duration);
    });

    // Get the most common one, or 0 as a suitable default (see handling below). OrderByDescending is stable, so the first of equal durations wins.
    let mostCommon = { beatLength: 0, duration: 0 };
    let first = true;

    for (const [beatLength, duration] of durations) {
      if (first || duration > mostCommon.duration)
        mostCommon = { beatLength, duration };
      first = false;
    }

    if (mostCommon.beatLength === 0)
      return TimingControlPoint.DEFAULT_BEAT_LENGTH;

    // Because of the rounding applied to the beat length above, it is possible for the "most common" beat length as determined by the linq query above
    // to actually be less or more than the raw range of unrounded beat lengths present in the map
    // To ensure this does not become a problem anywhere else further, clamp the result to the known raw range
    const minBeatLength = Math.min(...timingPoints.map(t => t.beatLength));
    const maxBeatLength = Math.max(...timingPoints.map(t => t.beatLength));
    return Math.min(Math.max(mostCommon.beatLength, minBeatLength), maxBeatLength);
  }

  audioLeadIn = 0;

  stackLeniency = Math.fround(0.7);

  specialStyle = false;

  letterboxInBreaks = false;

  widescreenStoryboard = true;

  epilepsyWarning = false;

  samplesMatchPlaybackRate = false;

  distanceSpacing = 1.0;

  gridSize = 0;

  timelineZoom = 1.0;

  countdown = CountdownType.None;

  countdownOffset = 0;

  bookmarks: number[] = [];

  sliderVelocityPresets: number[] = [0.75, 1, 1.5];

  beatmapVersion = LegacyBeatmapEncoder.FIRST_LAZER_VERSION;

  clone(): Beatmap<T> {
    return Object.assign(Object.create(Object.getPrototypeOf(this)) as Beatmap<T>, this);
  }

  toString(): string {
    return this.beatmapInfo.toString();
  }
}

export const BeatmapExtensions = {
  /** Find the total milliseconds between the first and last hittable objects. This is cached to BeatmapInfo.length, so using that is preferable when available. */
  calculatePlayableLength(beatmapOrObjects: IBeatmap | readonly HitObject[]): number {
    const [start, end] = BeatmapExtensions.calculatePlayableBounds(beatmapOrObjects);

    return end - start;
  },

  /** Find the total milliseconds between the first and last hittable objects, excluding any break time. */
  calculateDrainLength(beatmap: IBeatmap): number {
    return Math.max(BeatmapExtensions.calculatePlayableLength(beatmap.hitObjects) - beatmap.totalBreakTime, 0);
  },

  /** Find the timestamps in milliseconds of the start and end of the playable region. */
  calculatePlayableBounds(beatmapOrObjects: IBeatmap | readonly HitObject[]): [start: number, end: number] {
    const objects = 'hitObjects' in beatmapOrObjects ? beatmapOrObjects.hitObjects : beatmapOrObjects;

    if (objects.length === 0)
      return [0, 0];

    const lastObjectTime = max(objects, o => getEndTime(o));
    const firstObjectTime = objects[0].startTime;

    return [firstObjectTime, lastObjectTime];
  },

  /**
   * Find the absolute end time of the latest HitObject in a beatmap. Will throw if beatmap contains no objects.
   * This correctly accounts for rulesets which have concurrent hitobjects which may have durations, causing the .Last() object
   * to not necessarily have the latest end time.
   */
  getLastObjectTime(beatmap: IBeatmap): number {
    return max(beatmap.hitObjects, h => getEndTime(h));
  },
};

/** Enumerable.Max(selector) over doubles: throws for an empty sequence, NaN if any value is NaN. */
function max<T>(items: readonly T[], selector: (item: T) => number): number {
  if (items.length === 0)
    throw new Error('Sequence contains no elements');

  let value = selector(items[0]);

  for (let i = 1; i < items.length && !Number.isNaN(value); i++) {
    const x = selector(items[i]);
    if (x > value || Number.isNaN(x))
      value = x;
  }

  return value;
}
