// Ported from osu.Framework/Graphics/Transforms/Transformable.cs
// plus the generic (non-Drawable) helpers of osu.Framework/Graphics/TransformableExtensions.cs as methods.

import { InvokeOnDisposal } from '../allocation/InvokeOnDisposal';
import type { FrameTimeInfo, IFrameBasedClock } from '../timing/IClock';
import { DefaultEasingFunction, Easing, type IEasingFunction } from './Easing';
import { TargetGroupingTransformTracker } from './TargetGroupingTransformTracker';
import type { Bindable } from '../bindables/Bindable';
import type { Transform } from './Transform';
import { TransformBindable } from './TransformBindable';
import { TransformCustom } from './TransformCustom';
import { TransformSequence, type TransformSequenceGenerator } from './TransformSequence';

const almostEquals = (a: number, b: number) => Math.abs(a - b) <= 1e-7;

/** @internal */
export class AbsoluteSequenceSender implements Disposable {
  constructor(readonly sender: Transformable, readonly oldTransformDelay: number, readonly newTransformDelay: number) {}

  dispose(): void {
    if (!almostEquals(this.newTransformDelay, this.sender.transformDelay)) {
      throw new Error('transformStartTime at the end of absolute sequence is not the same as at the beginning, but should be. '
        + `(begin=${this.newTransformDelay} end=${this.sender.transformDelay})`);
    }

    this.sender.setTransformDelay(this.oldTransformDelay);
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

/** A type of object which can have transforms operating upon it. */
export abstract class Transformable {
  /** The clock that is used to provide the timing for this object's transforms. */
  abstract get clock(): IFrameBasedClock | null;

  /** The current frame's time as observed by this class's transforms. */
  get time(): FrameTimeInfo {
    return { elapsed: this.clock!.elapsedFrameTime, current: this.clock!.currentTime };
  }

  /** The current frame's time as observed by this class's transforms. */
  get timeCurrent(): number {
    return this.clock!.currentTime;
  }

  /** The starting time to use for transforms. */
  get transformStartTime(): number {
    return (this.clock?.currentTime ?? 0) + this._transformDelay;
  }

  /** Delay from the current time until new transforms are started, in milliseconds. */
  get transformDelay(): number {
    return this._transformDelay;
  }

  private _transformDelay = 0;

  /** @internal */ setTransformDelay(value: number): void {
    this._transformDelay = value;
  }

  /** A lazily-initialized list of transforms that are active on this object. */
  get transforms(): Transform[] {
    return this.targetGroupingTrackers?.flatMap(t => t.transforms) ?? [];
  }

  /** Retrieves the transforms for a given target member. */
  transformsForTargetMember(targetMember: string): readonly Transform[] {
    return this.getTrackerFor(targetMember)?.transforms ?? [];
  }

  /** The end time in milliseconds of the latest transform enqueued for this object, or now if there are none. */
  get latestTransformEndTime(): number {
    // expiry should happen either at the end of the last transform or using the current sequence delay (whichever is highest).
    let max = this.transformStartTime;

    if (this.targetGroupingTrackers !== null) {
      for (const tracker of this.targetGroupingTrackers) {
        for (const t of tracker.transforms) {
          if (t.endTime > max)
            max = t.endTime + 1; // adding 1ms here ensures we can expire on the current frame without issue.
        }
      }
    }

    return max;
  }

  /** Whether to remove completed transforms from the list of applicable transforms. Setting this to false allows for rewinding transforms. */
  get removeCompletedTransforms(): boolean {
    return this._removeCompletedTransforms;
  }

  set removeCompletedTransforms(value: boolean) {
    this._removeCompletedTransforms = value;
  }

  private _removeCompletedTransforms = true;

  /** Resets transformDelay and processes updates to this class based on loaded transforms. */
  protected updateTransforms(): void {
    this._transformDelay = 0;

    if (this.targetGroupingTrackers === null)
      return;

    this.updateTransformsAt(this.timeCurrent);
  }

  private lastUpdateTransformsTime = 0;

  private targetGroupingTrackers: TargetGroupingTransformTracker[] | null = null;

  private getTrackerFor(targetMember: string): TargetGroupingTransformTracker | null {
    if (this.targetGroupingTrackers !== null) {
      for (const t of this.targetGroupingTrackers) {
        if (t.targetMembers.has(targetMember))
          return t;
      }
    }

    return null;
  }

  private getTrackerForGrouping(targetGrouping: string, createIfNotExisting: boolean): TargetGroupingTransformTracker | null {
    if (this.targetGroupingTrackers !== null) {
      for (const t of this.targetGroupingTrackers) {
        if (t.targetGrouping === targetGrouping)
          return t;
      }
    }

    if (!createIfNotExisting)
      return null;

    const tracker = new TargetGroupingTransformTracker(this, targetGrouping);

    this.targetGroupingTrackers ??= [];
    this.targetGroupingTrackers.push(tracker);

    return tracker;
  }

  /** Process updates to this class based on loaded transforms. This does not reset transformDelay. */
  private updateTransformsAt(time: number, forceRewindReprocess = false): void {
    if (this.targetGroupingTrackers === null)
      return;

    const rewinding = this.lastUpdateTransformsTime > time || forceRewindReprocess;
    this.lastUpdateTransformsTime = time;

    // collection may grow due to abort / completion events.
    for (let i = 0; i < this.targetGroupingTrackers.length; i++)
      this.targetGroupingTrackers[i].updateTransforms(time, rewinding);
  }

  /** Removes a transform. Triggers its abort event. */
  removeTransform(toRemove: Transform): void {
    this.getTrackerForGrouping(toRemove.targetGrouping, false)?.removeTransform(toRemove);

    toRemove.triggerAbort();
  }

  /** Clears transforms (optionally of one member and/or of children). */
  clearTransforms(propagateChildren = false, targetMember: string | null = null): void {
    this.clearTransformsAfter(Number.NEGATIVE_INFINITY, propagateChildren, targetMember);
  }

  /** Removes transforms which are scheduled to start after time. */
  clearTransformsAfter(time: number, _propagateChildren = false, targetMember: string | null = null): void {
    if (this.targetGroupingTrackers === null)
      return;

    if (targetMember !== null) {
      this.getTrackerFor(targetMember)?.clearTransformsAfter(time, targetMember);
    } else {
      // collection may grow due to abort / completion events.
      for (let i = 0; i < this.targetGroupingTrackers.length; i++)
        this.targetGroupingTrackers[i].clearTransformsAfter(time);
    }
  }

  /** Applies transforms at a point in time. Only allowed when removeCompletedTransforms is false. */
  applyTransformsAt(time: number, _propagateChildren = false): void {
    if (this.removeCompletedTransforms) throw new Error('Cannot arbitrarily apply transforms with removeCompletedTransforms active.');

    this.updateTransformsAt(time);
  }

  /** Finishes specified transforms, using their end value. */
  finishTransforms(_propagateChildren = false, targetMember: string | null = null): void {
    if (this.targetGroupingTrackers === null)
      return;

    if (targetMember !== null) {
      this.getTrackerFor(targetMember)?.finishTransforms(targetMember);
    } else {
      // Use for over foreach as collection may grow due to abort / completion events.
      // Note that this may mean that in the addition of elements being removed,
      // `FinishTransforms` may not be called on all items.
      for (let i = 0; i < this.targetGroupingTrackers.length; i++)
        this.targetGroupingTrackers[i].finishTransforms();
    }
  }

  /** Add a delay duration to transformDelay, in milliseconds. @internal */
  addDelay(duration: number, _propagateChildren = false): void {
    this._transformDelay += duration;
  }

  /** Start a sequence of transforms with a (cumulative) relative delay applied. Dispose it (or `using`) to end the sequence. */
  beginDelayedSequence(delay: number, recursive = true): Disposable & { dispose(): void } {
    if (delay === 0)
      return new InvokeOnDisposal(() => {});

    this.addDelay(delay, recursive);
    const newTransformDelay = this._transformDelay;

    return new InvokeOnDisposal(() => {
      if (!almostEquals(newTransformDelay, this._transformDelay)) {
        throw new Error('transformStartTime at the end of delayed sequence is not the same as at the beginning, but should be. '
          + `(begin=${newTransformDelay} end=${this._transformDelay})`);
      }

      this.addDelay(-delay, recursive);
    });
  }

  /** Start a sequence of transforms from an absolute time value. Dispose it (or `using`) to end the sequence. */
  beginAbsoluteSequence(newTransformStartTime: number, _recursive = true): Disposable & { dispose(): void } {
    return this.createAbsoluteSequenceAction(newTransformStartTime);
  }

  /** @internal */
  collectAbsoluteSequenceActionsFromSubTree(newTransformStartTime: number, actions: AbsoluteSequenceSender[]): void {
    actions.push(this.createAbsoluteSequenceAction(newTransformStartTime));
  }

  private createAbsoluteSequenceAction(newTransformStartTime: number): AbsoluteSequenceSender {
    const oldTransformDelay = this._transformDelay;
    const newTransformDelay = this._transformDelay = newTransformStartTime - (this.clock?.currentTime ?? 0);

    return new AbsoluteSequenceSender(this, oldTransformDelay, newTransformDelay);
  }

  /** Adds to this object a transform which is later handled by updateTransforms. */
  addTransform(transform: Transform, customTransformID?: number): void {
    if (transform.targetTransformable !== this)
      throw new Error('transform must have been populated via populateTransform using this object prior to being added.');

    if (this.clock === null) {
      if (!transform.hasStartValue) {
        transform.readIntoStartValue();
        transform.hasStartValue = true;
      }

      transform.apply(transform.endTime);
      transform.triggerComplete();

      return;
    }

    this.getTrackerForGrouping(transform.targetGrouping, true)!.addTransform(transform, customTransformID);

    // If our newly added transform could have an immediate effect, then let's
    // make this effect happen immediately.
    // This is done globally instead of locally in the single member tracker
    // to keep the transformable's state consistent (e.g. with lastUpdateTransformsTime)
    if (transform.startTime < this.timeCurrent || transform.endTime <= this.timeCurrent)
      this.updateTransformsAt(this.timeCurrent, !this.removeCompletedTransforms && transform.startTime <= this.timeCurrent);
  }

  // ---- TransformableExtensions (generic part) ----

  /**
   * Transforms a given property or field member of this object to newValue, smoothly over time using easing.
   * grouping: optional grouping when the same property may be touched by multiple transform types (e.g. X with Position).
   */
  transformTo<TValue>(propertyOrFieldName: string, newValue: TValue, duration = 0, easing: Easing | IEasingFunction = Easing.None,
                      grouping: string | null = null): TransformSequence<this> {
    return this.applyTransform(this.makeTransform(propertyOrFieldName, newValue, duration, easing, grouping));
  }

  /** Smoothly adjusts the value of a bindable over time. */
  transformBindableTo<TValue>(bindable: Bindable<TValue>, newValue: TValue, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.applyTransform(this.populateTransform(new TransformBindable<TValue, this>(bindable), newValue, duration, easing));
  }

  /** Applies a transform to this object (TransformableExtensions.TransformTo(this T, Transform)). */
  applyTransform(transform: Transform): TransformSequence<this> {
    const result = new TransformSequence<this>(this);
    result.add(transform);
    this.addTransform(transform);
    return result;
  }

  makeTransform<TValue>(propertyOrFieldName: string, newValue: TValue, duration = 0, easing: Easing | IEasingFunction = Easing.None,
                        grouping: string | null = null): Transform<TValue, this> {
    return this.populateTransform(new TransformCustom<TValue, this>(propertyOrFieldName, grouping), newValue, duration, easing);
  }

  /** Populates a newly created transform with necessary values. All transforms must be populated by this method prior to being used. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  populateTransform<TValue, TTransform extends Transform<TValue, any>>(transform: TTransform, newValue: TValue, duration = 0,
                                                                         easing: Easing | IEasingFunction = Easing.None): TTransform {
    if (typeof newValue === 'number' && !Number.isFinite(newValue))
      throw new RangeError(`newValue must be finite, but is ${newValue}.`);

    if (duration < 0)
      throw new RangeError(`duration must be non-negative, but is ${duration}.`);

    if (transform.target !== null)
      throw new Error('May not populateTransform the same Transform more than once.');

    transform.target = this;

    const startTime = this.transformStartTime;

    transform.startTime = startTime;
    transform.endTime = startTime + duration;
    transform.endValue = newValue;
    transform.easing = typeof easing === 'number' ? new DefaultEasingFunction(easing) : easing;

    return transform;
  }

  /** A sequence that starts immediately, containing the given generators. */
  animate(...childGenerators: TransformSequenceGenerator<this>[]): TransformSequence<this> {
    return this.delay(0, ...childGenerators);
  }

  /** Advances the start time of future appended transforms by delay milliseconds. */
  delay(delay: number, ...childGenerators: TransformSequenceGenerator<this>[]): TransformSequence<this> {
    return new TransformSequence<this>(this).delay(delay, ...childGenerators);
  }

  /** Returns a sequence starting after all current transforms have finished. */
  delayUntilTransformsFinished(): TransformSequence<this> {
    return this.delay(Math.max(0, this.latestTransformEndTime - this.timeCurrent));
  }

  /**
   * Repeats the given generators (or, without generators, nothing — see TransformSequence.loop) with pause between iterations.
   * numIters < 0 (default) loops forever.
   */
  loop(pause: number, numIters: number, ...childGenerators: TransformSequenceGenerator<this>[]): TransformSequence<this>;
  loop(pause?: number, ...childGenerators: TransformSequenceGenerator<this>[]): TransformSequence<this>;
  loop(...childGenerators: TransformSequenceGenerator<this>[]): TransformSequence<this>;
  loop(...args: unknown[]): TransformSequence<this> {
    const seq = this.delay(0);
    return (seq.loop as (...a: unknown[]) => TransformSequence<this>)(...args);
  }
}
