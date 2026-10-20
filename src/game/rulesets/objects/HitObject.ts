// Ported from osu.Game/Rulesets/Objects/HitObject.cs (judgements are not ported).

import { BindableList } from '@fw/bindables/BindableList';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { Signal } from '@fw/bindables/Signal';
import { HitSampleInfo } from '../../audio/HitSampleInfo';
import type { IBeatmapDifficultyInfo } from '../../beatmaps/BeatmapDifficulty';
import type { ControlPointInfo } from '../../beatmaps/controlPoints/ControlPointInfo';
import { DefaultHitWindows, type HitWindows } from '../scoring/HitWindows';
import { HitResult } from '../scoring/HitResult';
import { hasDuration } from './types/Types';

/**
 * A HitObject describes an object in a Beatmap.
 * HitObjects may contain more properties for which you should be checking through the IHas* types.
 */
export class HitObject {
  /** A small adjustment to the start time of control point queries to accommodate for floating-point precision errors. */
  private static readonly control_point_leniency = 1;

  /** Invoked after applyDefaults has completed on this HitObject. */
  readonly defaultsApplied = new Signal<HitObject>();

  readonly startTimeBindable = new BindableDouble();

  /** The time at which the HitObject starts. */
  get startTime(): number {
    return this.startTimeBindable.value;
  }

  set startTime(value: number) {
    this.startTimeBindable.value = value;
  }

  readonly samplesBindable = new BindableList<HitSampleInfo>();

  /** The samples to be played when this hit object is hit. In the case of IHasRepeats objects, this is the sample of the curve body and can be treated as the default samples for the hit object. */
  get samples(): readonly HitSampleInfo[] {
    return this.samplesBindable.toArray();
  }

  set samples(value: readonly HitSampleInfo[]) {
    this.samplesBindable.clear();
    this.samplesBindable.addRange(value);
  }

  /** Any samples which may be used by this hit object that are non-standard. This is used only to preload these samples ahead of time. */
  get auxiliarySamples(): readonly HitSampleInfo[] {
    return [];
  }

  private _kiai = false;

  /** Whether this HitObject is in Kiai time. */
  get kiai(): boolean {
    return this._kiai;
  }

  /** The hit windows for this HitObject. */
  hitWindows: HitWindows | null = null;

  private readonly _nestedHitObjects: HitObject[] = [];

  get nestedHitObjects(): readonly HitObject[] {
    return this._nestedHitObjects;
  }

  /** Applies default values to this HitObject. */
  applyDefaults(controlPointInfo: ControlPointInfo, difficulty: IBeatmapDifficultyInfo): void {
    this.applyDefaultsToSelf(controlPointInfo, difficulty);

    this._nestedHitObjects.length = 0;

    this.createNestedHitObjects();

    this.onNestedHitObjectsCreated();

    // Array.prototype.sort is stable, as List.Sort is not: osu! relies on nested objects having distinct start times.
    this._nestedHitObjects.sort((h1, h2) => h1.startTime - h2.startTime);

    for (const h of this._nestedHitObjects)
      h.applyDefaults(controlPointInfo, difficulty);

    // `ApplyDefaults()` may be called multiple times on a single hitobject.
    // to prevent subscribing to `StartTimeBindable.ValueChanged` multiple times with the same callback,
    // remove the previous subscription (if present) before (re-)registering.
    this.startTimeBindable.valueChanged.remove(this.onStartTimeChanged);

    // this callback must be (re-)registered after default application
    // to ensure that the read of `this.GetEndTime()` within `onStartTimeChanged` doesn't return an invalid value
    // if `StartTimeBindable` is changed prior to default application.
    this.startTimeBindable.valueChanged.add(this.onStartTimeChanged);

    this.defaultsApplied.emit(this);
  }

  private readonly onStartTimeChanged = (time: { oldValue: number; newValue: number }) => {
    const offset = time.newValue - time.oldValue;

    for (const nested of this._nestedHitObjects)
      nested.startTime += offset;
  };

  /** Hook for IHasComboInformation hit objects to bind their nested objects' combo information (done in ApplyDefaults in C#). */
  protected onNestedHitObjectsCreated(): void {
  }

  protected applyDefaultsToSelf(controlPointInfo: ControlPointInfo, difficulty: IBeatmapDifficultyInfo): void {
    this._kiai = controlPointInfo.effectPointAt(this.startTime + HitObject.control_point_leniency).kiaiMode;

    this.hitWindows ??= this.createHitWindows();
    this.hitWindows?.setDifficulty(difficulty.overallDifficulty);
  }

  protected createNestedHitObjects(): void {
  }

  protected addNested(hitObject: HitObject): void {
    this._nestedHitObjects.push(hitObject);
  }

  /** Creates the HitWindows for this HitObject. This can be null to indicate that the HitObject has no HitWindows and timing errors should not be displayed to the user. */
  protected createHitWindows(): HitWindows | null {
    return new DefaultHitWindows();
  }

  /** The maximum offset from the end time of HitObject at which this HitObject can be judged. */
  get maximumJudgementOffset(): number {
    return this.hitWindows?.windowFor(HitResult.Miss) ?? 0;
  }

  /** Create a SampleInfo based on the sample settings of the hit normal sample in Samples. */
  createHitSampleInfo(sampleName = HitSampleInfo.HIT_NORMAL): HitSampleInfo {
    // As per stable, all non-normal "addition" samples should use the same bank.
    if (sampleName !== HitSampleInfo.HIT_NORMAL) {
      const existingAddition = this.samples.find(s => s.name !== HitSampleInfo.HIT_NORMAL);
      if (existingAddition !== undefined)
        return existingAddition.with({ name: sampleName });
    }

    // Fall back to using the normal sample bank otherwise.
    const existingNormal = this.samples.find(s => s.name === HitSampleInfo.HIT_NORMAL);
    if (existingNormal !== undefined)
      return existingNormal.with({ name: sampleName, editorAutoBank: true });

    return new HitSampleInfo(sampleName);
  }

  toString(): string {
    return `${this.constructor.name} @ ${this.startTime}`;
  }
}

/** HitObjectExtensions.GetEndTime: the end time of this object (its start time if it has no duration). */
export function getEndTime(hitObject: HitObject): number {
  return hasDuration(hitObject) ? hitObject.endTime : hitObject.startTime;
}
