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
