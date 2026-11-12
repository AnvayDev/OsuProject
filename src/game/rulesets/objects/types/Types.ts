// Ported from osu.Game/Rulesets/Objects/Types/IHas*.cs. C# interface checks (`h is IHasDuration`) become type guards on member presence.

import type { HitSampleInfo } from '../../../audio/HitSampleInfo';
import type { Vector2F } from '@fw/layout/Vector2F';
import type { SliderPath } from '../SliderPath';

/** A HitObject that ends at a different time than its start time. */
export interface IHasDuration {
  /** The time at which the HitObject ends. */
  readonly endTime: number;
  /** The duration of the HitObject. */
  readonly duration: number;
}

/** A HitObject that spans some length. */
export interface IHasDistance extends IHasDuration {
  /** The positional length of the HitObject. */
  readonly distance: number;
}

/** A HitObject that has a positional length. */
export interface IHasPath extends IHasDistance {
  /** The curve. */
  readonly path: SliderPath;
}

/** A HitObject that spans some length. */
export interface IHasRepeats extends IHasDuration {
  /** The amount of times the HitObject repeats. */
  repeatCount: number;
  /** The samples to be played when each node of the IHasRepeats is hit. 0: The first node. 1: The first repeat. 2: The second repeat. ... n-1: The last repeat. n: The last node. */
  nodeSamples: HitSampleInfo[][];
}

export type IHasPathWithRepeats = IHasPath & IHasRepeats;

/** A HitObject that has a starting position. */
export interface IHasPosition {
  readonly x: number;
  readonly y: number;
  readonly position: Vector2F;
}

/** A HitObject that is part of a combo. */
export interface IHasCombo {
  /** Whether the HitObject starts a new combo. */
  readonly newCombo: boolean;
  /** When starting a new combo, the offset of the new combo relative to the current one. This is generally a setting provided by a beatmap creator to choreograph interesting colour patterns which can only be achieved by skipping combo colours with per-hitobject level. It is exposed via IHasComboInformation.ComboIndexWithOffsets. */
  readonly comboOffset: number;
}

/** A HitObject that has a slider velocity multiplier. */
export interface IHasSliderVelocity {
  sliderVelocityMultiplier: number;
}

/** A type of HitObject which may require generating ticks. */
export interface IHasGenerateTicks {
  /** Whether or not slider ticks should be generated at this control point. This exists for backwards compatibility with maps that abuse NaN slider velocity behavior on osu!stable (e.g. /b/2628991). */
  generateTicks: boolean;
}

export const hasDuration = (h: object): h is IHasDuration => 'endTime' in h && 'duration' in h;
export const hasRepeats = (h: object): h is IHasRepeats => hasDuration(h) && 'repeatCount' in h && 'nodeSamples' in h;
export const hasPath = (h: object): h is IHasPath => hasDuration(h) && 'path' in h && 'distance' in h;
export const hasPosition = (h: object): h is IHasPosition => 'position' in h;
export const hasCombo = (h: object): h is IHasCombo => 'newCombo' in h && 'comboOffset' in h;
export const hasSliderVelocity = (h: object): h is IHasSliderVelocity => 'sliderVelocityMultiplier' in h;
export const hasGenerateTicks = (h: object): h is IHasGenerateTicks => 'generateTicks' in h;

/** IHasRepeats extension: the amount of times the length of this IHasRepeats spans. */
export function spanCount(obj: IHasRepeats): number {
  return obj.repeatCount + 1;
}

// #region HasPathWithRepeatsExtensions (IHasPathWithRepeats.cs)

/** Computes the position on the curve relative to how much of the HitObject has been completed. `progress`: [0, 1] where 0 is the start time and 1 is the end time. */
export function curvePositionAt(obj: IHasPathWithRepeats, progress: number): Vector2F {
  return obj.path.positionAt(progressAt(obj, progress));
}

/** Computes the progress along the curve relative to how much of the HitObject has been completed. Returns [0, 1] where 0 is the beginning of the curve and 1 is the end. */
export function progressAt(obj: IHasPathWithRepeats, progress: number): number {
  let p = progress * spanCount(obj) % 1;
  if (spanAt(obj, progress) % 2 === 1)
    p = 1 - p;
  return p;
}

/** Determines which span of the curve the progress point is on. Returns [0, spanCount) where 0 is the first run. */
export function spanAt(obj: IHasPathWithRepeats, progress: number): number {
  return Math.trunc(progress * spanCount(obj));
}

// #endregion

// #region HasRepeatsExtensions (IHasRepeats.cs)

/** Retrieves the samples at a particular node in an IHasRepeats object: the node's samples, or the object's own if the node has none. */
export function getNodeSamples(obj: IHasRepeats & { readonly samples: readonly HitSampleInfo[] }, nodeIndex: number): readonly HitSampleInfo[] {
  return nodeIndex < obj.nodeSamples.length ? obj.nodeSamples[nodeIndex] : obj.samples;
}

/** Ensures that the list of node samples is populated with at least the default samples. */
export function populateNodeSamples(obj: IHasRepeats & { readonly samples: readonly HitSampleInfo[] }): void {
  while (obj.nodeSamples.length < obj.repeatCount + 2)
    obj.nodeSamples.push(obj.samples.map(o => o.with()));
}

// #endregion

/** A HitObject that is part of a combo and has extended information about its position relative to other combo objects (IHasComboInformation.cs). */
export interface IHasComboInformation extends IHasCombo {
  /** The index of this hitobject in the current combo. */
  indexInCurrentCombo: number;
  /** The index of this combo in relation to the beatmap. In other words, this is incremented by 1 each time a newCombo is reached. */
  comboIndex: number;
  /** The index of this combo in relation to the beatmap, with all aggregate comboOffsets applied. This should be used instead of comboIndex only when retrieving combo colours from the beatmap's skin. */
  comboIndexWithOffsets: number;
  newCombo: boolean;
  comboOffset: number;
  /** Whether this is the last object in the current combo. */
  lastInCombo: boolean;
  /** Given the previous object in the beatmap, update relevant combo information. */
  updateComboInformation(lastObj: IHasComboInformation | null): void;
}

export const hasComboInformation = (h: object): h is IHasComboInformation => 'comboIndex' in h && 'indexInCurrentCombo' in h && 'updateComboInformation' in h;

