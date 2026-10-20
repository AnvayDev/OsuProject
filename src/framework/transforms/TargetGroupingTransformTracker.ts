// Ported from osu.Framework/Graphics/Transforms/TargetGroupingTransformTracker.cs

import { SortedList } from '../lists/SortedList';
import type { ITransformSequence } from './ITransformSequence';
import { Transform } from './Transform';
import type { Transformable } from './Transformable';

/** Tracks the lifetime of transforms for one specified target member. */
export class TargetGroupingTransformTracker {
  /** A list of transforms associated with the target grouping. */
  get transforms(): readonly Transform[] {
    return this._transforms.toArray();
  }

  private readonly _transforms = new SortedList<Transform>(Transform.COMPARER);

  private readonly removalActions: [ITransformSequence, (s: ITransformSequence) => void][] = [];

  /** Used to assign a monotonically increasing ID to transforms as they are added. */
  private currentTransformID = 0;

  /** Per target member, the index of the first transform that has not yet been applied to end. */
  private readonly lastAppliedTransformIndices = new Map<string, number>();

  /** All target members that have transforms in this tracker. */
  get targetMembers(): ReadonlySet<string> {
    return this._targetMembers;
  }

  private readonly _targetMembers = new Set<string>();

  constructor(private readonly transformable: Transformable, readonly targetGrouping: string) {}

  private appliedToEndReverts: Set<string> | null = null;

  updateTransforms(time: number, rewinding: boolean): void {
    const transforms = this._transforms;

    if (rewinding && !this.transformable.removeCompletedTransforms) {
      this.resetLastAppliedCache();

      this.appliedToEndReverts?.clear();

      // Under the case that completed transforms are not removed, reversing the clock is permitted.
      // We need to first look back through all the transforms and apply the start values of the ones that were previously
      // applied, but now exist in the future relative to the current time.
      for (let i = transforms.count - 1; i >= 0; i--) {
        const t = transforms.get(i);

        // rewind logic needs to only run on transforms which have been applied at least once.
        if (!t.applied)
          continue;

        // some specific transforms can be marked as non-rewindable.
        if (!t.rewindable)
          continue;

        if (time >= t.startTime) {
          // we are in the middle of this transform, so we want to mark as not-completely-applied.
          // note that we should only do this for the last transform of each TargetMember to avoid incorrect application order.
          // the actual application will be in the main loop below now that AppliedToEnd is false.
          if (this.appliedToEndReverts?.has(t.targetMember) !== true) {
            t.appliedToEnd = false;

            this.appliedToEndReverts ??= new Set<string>();
            this.appliedToEndReverts.add(t.targetMember);
          }
        } else {
          // we are before the start time of this transform, so we want to eagerly apply the value at current time and mark as not-yet-applied.
          // this transform will not be applied again unless we play forward in the future.
          t.apply(time);
          t.applied = false;
          t.appliedToEnd = false;
        }
      }
    }

    for (let i = this.getLastAppliedIndex(); i < transforms.count; ++i) {
      let t = transforms.get(i);

      const tCanRewind = !this.transformable.removeCompletedTransforms && t.rewindable;

      let flushAppliedCache = false;

      if (time < t.startTime)
        break;

      if (!t.applied) {
        // This is the first time we are updating this transform.
        // We will find other still active transforms which act on the same target member and remove them.
        // Since following transforms acting on the same target member are immediately removed when a
        // new one is added, we can be sure that previous transforms were added before this one and can
        // be safely removed.
        for (let j = this.getLastAppliedIndex(t.targetMember); j < i; ++j) {
          const u = transforms.get(j);
          if (u.targetMember !== t.targetMember) continue;

          if (!u.appliedToEnd)
            // we may have applied the existing transforms too far into the future.
            // we want to prepare to potentially read into the newly activated transform's StartTime,
            // so we should re-apply using its StartTime as a basis.
            u.apply(t.startTime);

          if (!tCanRewind) {
            transforms.removeAt(j--);
            flushAppliedCache = true;
            i--;

            if (u.abortTargetSequence !== null)
              this.removalActions.push([u.abortTargetSequence, s => s.transformAborted()]);
          } else
            u.appliedToEnd = true;
        }
      }

      if (!t.hasStartValue) {
        t.readIntoStartValue();
        t.hasStartValue = true;
      }

      if (!t.appliedToEnd) {
        t.apply(time);

        t.appliedToEnd = time >= t.endTime;

        if (t.appliedToEnd) {
          if (!tCanRewind) {
            transforms.removeAt(i--);
            flushAppliedCache = true;
          }

          if (t.loopCount > 0)
            t.loopCount--;

          if (t.isLooping) {
            const oldLoopCount = t.loopCount;

            if (tCanRewind) {
              t.loopCount = 0;
              t = t.clone();
            }

            t.appliedToEnd = false;
            t.applied = false;
            t.hasStartValue = false;

            if (tCanRewind)
              t.loopCount = oldLoopCount;

            t.startTime += t.loopDelay;
            t.endTime += t.loopDelay;

            // this could be added back at a lower index than where we are currently iterating, but
            // running the same transform twice isn't a huge deal.
            transforms.add(t);
            flushAppliedCache = true;
          } else if (t.completionTargetSequence !== null)
            this.removalActions.push([t.completionTargetSequence, s => s.transformCompleted()]);
        }
      }

      if (flushAppliedCache)
        this.resetLastAppliedCache();
      // if this transform is applied to end, we can be sure that all previous transforms have been completed.
      else if (t.appliedToEnd)
        this.setLastAppliedIndex(t.targetMember, i + 1);
    }

    this.invokePendingRemovalActions();
  }

  /**
   * Adds to this object a transform which is later handled by updateTransforms.
   * Transforms which follow it (in start time) on the same target member are removed (aborted).
   */
  addTransform(transform: Transform, customTransformID?: number): void {
    if (transform.targetGrouping !== this.targetGrouping)
      throw new Error(`Target grouping "${transform.targetGrouping}" does not match this tracker's grouping "${this.targetGrouping}".`);

    this._targetMembers.add(transform.targetMember);

    if (transform.transformID !== 0 && this._transforms.contains(transform))
      throw new Error('Transformable may not contain the same Transform more than once.');

    transform.transformID = customTransformID ?? ++this.currentTransformID;
    const insertionIndex = this._transforms.add(transform);
    this.resetLastAppliedCache();

    // Remove all existing following transforms touching the same property as this one.
    for (let i = insertionIndex + 1; i < this._transforms.count; ++i) {
      const t = this._transforms.get(i);

      if (t.targetMember === transform.targetMember) {
        this._transforms.removeAt(i--);
        if (t.abortTargetSequence !== null)
          this.removalActions.push([t.abortTargetSequence, s => s.transformAborted()]);
      }
    }

    this.invokePendingRemovalActions();
  }

  /** Removes a transform. Does not trigger abort events. */
  removeTransform(toRemove: Transform): void {
    this._transforms.remove(toRemove);
    this.resetLastAppliedCache();
  }

  /** Removes transforms that start at or after time, optionally only for one target member. */
  clearTransformsAfter(time: number, targetMember: string | null = null): void {
    this.resetLastAppliedCache();

    for (let i = 0; i < this._transforms.count; i++) {
      const t = this._transforms.get(i);

      if ((targetMember === null || t.targetMember === targetMember) && t.startTime >= time) {
        this._transforms.removeAt(i--);
        if (t.abortTargetSequence !== null)
          this.removalActions.push([t.abortTargetSequence, s => s.transformAborted()]);
      }
    }

    this.invokePendingRemovalActions();
  }

  /** Finishes all non-looping transforms (or those of one member) immediately, applying their end values. */
  finishTransforms(targetMember: string | null = null): void {
    const toFlushPredicate = targetMember === null
      ? (t: Transform) => !t.isLooping
      : (t: Transform) => !t.isLooping && t.targetMember === targetMember;

    // Flush is undefined for endlessly looping transforms
    const toFlush = this._transforms.filter(toFlushPredicate);

    this._transforms.removeAll(toFlushPredicate);
    this.resetLastAppliedCache();

    for (const t of toFlush) {
      if (!t.hasStartValue) {
        t.readIntoStartValue();
        t.hasStartValue = true;
      }

      t.apply(t.endTime);
      t.triggerComplete();
    }
  }

  private invokePendingRemovalActions(): void {
    let item: [ITransformSequence, (s: ITransformSequence) => void] | undefined;

    while ((item = this.removalActions.shift()) !== undefined)
      item[1](item[0]);
  }

  /** Retrieve the last applied index for a specific target member, or the minimum across all members when null. */
  private getLastAppliedIndex(targetMember: string | null = null): number {
    if (targetMember === null) {
      let min = Number.MAX_SAFE_INTEGER;

      for (const i of this.lastAppliedTransformIndices.values()) {
        if (i < min)
          min = i;
      }

      return min;
    }

    return this.lastAppliedTransformIndices.get(targetMember) ?? 0;
  }

  private setLastAppliedIndex(targetMember: string, index: number): void {
    this.lastAppliedTransformIndices.set(targetMember, index);
  }

  private resetLastAppliedCache(): void {
    for (const tracked of this._targetMembers)
      this.lastAppliedTransformIndices.set(tracked, 0);
  }
}
