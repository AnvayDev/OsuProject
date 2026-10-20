// Ported from osu.Framework/Graphics/Transforms/TransformSequence.cs

import { Easing, type IEasingFunction } from './Easing';
import type { ITransformSequence } from './ITransformSequence';
import { Transform } from './Transform';
import type { Transformable } from './Transformable';

/** A function which takes an origin and returns a sequence of transforms on it (TransformSequence<T>.Generator). */
export type TransformSequenceGenerator<T extends Transformable> = (origin: T) => TransformSequence<T>;

/** A sequence of transforms on a single target, supporting then/delay/loop and completion/abort callbacks. */
export class TransformSequence<T extends Transformable> implements ITransformSequence {
  private readonly origin: T;

  private readonly transforms: Transform[] = []; // the most common usage of transforms sees one transform being added.

  private hasCompleted = true;

  private readonly startTime: number;
  private currentTime: number;

  private get endTime(): number {
    return Math.max(this.currentTime, this.lastEndTime);
  }

  private last: Transform | null = null;
  private lastEndTime: number;

  private get hasEnd(): boolean {
    return this.lastEndTime !== Number.POSITIVE_INFINITY;
  }

  /** Creates a new empty sequence at origin's current transformStartTime. */
  constructor(origin: T) {
    if (origin == null)
      throw new Error('May not create a TransformSequence with a null origin.');

    this.origin = origin;
    this.startTime = this.currentTime = this.lastEndTime = origin.transformStartTime;
  }

  private onLoopingTransform(): void {
    // As soon as we have an infinitely looping transform,
    // completion no longer makes sense.
    if (this.last !== null)
      this.last.completionTargetSequence = null;

    this.last = null;
    this.lastEndTime = Number.POSITIVE_INFINITY;
    this.hasCompleted = false;
  }

  /** Appends a TransformTo of the given member at the current position in the sequence. */
  transformTo<TValue>(propertyOrFieldName: string, newValue: TValue, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<T> {
    return this.append(o => o.transformTo(propertyOrFieldName, newValue, duration, easing));
  }

  /** @internal */
  add(transform: Transform): void {
    if (transform.targetTransformable !== this.origin)
      throw new Error(`transform must operate upon origin=${this.origin}, but operates upon ${transform.targetTransformable}.`);

    this.transforms.push(transform);

    transform.completionTargetSequence = null;
    transform.abortTargetSequence = this;

    if (transform.isLooping)
      this.onLoopingTransform();

    // Update last transform for completion callback
    if (this.last === null || transform.endTime > this.lastEndTime) {
      if (this.last !== null)
        this.last.completionTargetSequence = null;

      this.last = transform;
      this.last.completionTargetSequence = this;
      this.lastEndTime = this.last.endTime;
      this.hasCompleted = false;
    }
  }

  /**
   * Appends a child generator (or several) at the current position, or runs an arbitrary action on the origin with
   * the transform start time set to the current position (Append(Action<T>)).
   */
  append(...childGenerators: (TransformSequenceGenerator<T> | ((origin: T) => void))[]): TransformSequence<T> {
    for (const p of childGenerators)
      this.appendOne(p);

    return this;
  }

  private appendOne(childGenerator: TransformSequenceGenerator<T> | ((origin: T) => void)): void {
    let child: unknown;

    const seq = this.origin.beginAbsoluteSequence(this.currentTime, false);
    try {
      child = childGenerator(this.origin);
    } finally {
      seq.dispose();
    }

    // Append(Action<T>) overload: no sequence to merge.
    if (!(child instanceof TransformSequence))
      return;

    if (child.origin !== this.origin)
      throw new Error('May not append TransformSequence with different origin.');

    const oldLast = this.last;
    for (const t of child.transforms)
      this.add(t);

    // If we flatten a child into ourselves that already completed, then
    // we need to make sure to update the hasCompleted value, too, since
    // the already completed final transform will no longer fire any events.
    if (oldLast !== this.last)
      this.hasCompleted = child.hasCompleted;
  }

  private subscribeComplete(func: () => void): void {
    if (this.onCompleteAction !== null) {
      throw new Error('May not subscribe completion multiple times.'
        + 'This exception is also caused by calling then or finally on an infinitely looping TransformSequence.');
    }

    this.onCompleteAction = func;

    // Completion can be immediately triggered by instant transforms,
    // and therefore when subscribing we need to take into account
    // potential previous completions.
    if (this.hasCompleted)
      func();
  }

  private subscribeAbort(func: () => void): void {
    if (this.onAbortAction !== null)
      throw new Error('May not subscribe abort multiple times.');

    // No need to worry about new transforms immediately aborting, so
    // we can just subscribe here and be sure abort couldn't have been
    // triggered already.
    this.onAbortAction = func;
  }

  private onCompleteAction: (() => void) | null = null;
  private onAbortAction: (() => void) | null = null;

  /**
   * Repeats all added transforms (or the given generators, appended as a child sequence) indefinitely or numIters times,
   * with pause milliseconds between iterations.
   *
   * Overloads (C#): Loop(pause, numIters, ...generators), Loop(pause, numIters), Loop(pause, ...generators), Loop(...generators), Loop(pause = 0).
   */
  loop(pause: number, numIters: number, ...childGenerators: TransformSequenceGenerator<T>[]): TransformSequence<T>;
  loop(pause?: number, ...childGenerators: TransformSequenceGenerator<T>[]): TransformSequence<T>;
  loop(...childGenerators: TransformSequenceGenerator<T>[]): TransformSequence<T>;
  loop(...args: unknown[]): TransformSequence<T> {
    let pause = 0;
    let numIters: number | null = null;

    if (typeof args[0] === 'number') {
      pause = args.shift() as number;

      if (typeof args[0] === 'number')
        numIters = args.shift() as number;
    }

    const childGenerators = args as TransformSequenceGenerator<T>[];

    if (childGenerators.length > 0) {
      this.append(o => {
        const childSequence = new TransformSequence<T>(o);
        childSequence.append(...childGenerators);

        if (numIters !== null)
          childSequence.loopFinite(pause, numIters);
        else
          childSequence.loopForever(pause);

        return childSequence;
      });

      return this;
    }

    return numIters !== null ? this.loopFinite(pause, numIters) : this.loopForever(pause);
  }

  /** Loop(double pause, int numIters) */
  private loopFinite(pause: number, numIters: number): TransformSequence<T> {
    if (numIters < 1)
      throw new Error(`May not loop for fewer than 1 iteration (${numIters} attempted).`);

    if (!this.hasEnd)
      throw new Error('Can not perform loop on an endless TransformSequence.');

    this.makeTransformsLooping(pause, numIters);
    return this;
  }

  /** Loop(double pause = 0) */
  private loopForever(pause: number): TransformSequence<T> {
    if (!this.hasEnd)
      throw new Error('Can not perform loop on an endless TransformSequence.');

    this.makeTransformsLooping(pause);
    this.onLoopingTransform();
    return this;
  }

  private makeTransformsLooping(pause: number, numIters = -1): void {
    const iterDuration = this.endTime - this.startTime + pause;

    for (const t of this.transforms) {
      const tmpOnAbort = t.abortTargetSequence;
      t.abortTargetSequence = null;
      t.targetTransformable.removeTransform(t);
      t.abortTargetSequence = tmpOnAbort;

      // Update start and end times such that no transformations need to be instantly
      // looped right after they're added. This is required so that transforms can be
      // inserted in the correct order such that none of them trigger abortions on
      // each other due to instant re-sorting upon adding.
      const currentTransformTime = t.targetTransformable.timeCurrent;

      let pushForwardCount = 0;

      while (t.endTime <= currentTransformTime) {
        t.startTime += iterDuration;
        t.endTime += iterDuration;
        pushForwardCount++;
      }

      // In the finite case, we set LoopCount to the correct value to not add extra unneeded loops
      t.loopCount = numIters === -1 ? -1 : numIters - pushForwardCount;
    }

    // This sort is required such that no abortions happen.
    const sortedTransforms = [...this.transforms];
    sortedTransforms.sort(Transform.COMPARER);

    for (const t of sortedTransforms) {
      t.loopDelay = iterDuration;

      t.applied = false;
      t.appliedToEnd = false; // we want to force a reprocess of this transform. it may have been applied-to-end in the Add, but not correctly looped as a result.

      t.targetTransformable.addTransform(t, t.transformID);
    }
  }

  /**
   * Advances the start time of future appended transforms to the latest end time of all transforms in this sequence,
   * plus an optional delay. Then appends the given generators.
   */
  then(...childGenerators: TransformSequenceGenerator<T>[]): TransformSequence<T>;
  then(delay: number, ...childGenerators: TransformSequenceGenerator<T>[]): TransformSequence<T>;
  then(...args: unknown[]): TransformSequence<T> {
    const delay = typeof args[0] === 'number' ? args.shift() as number : 0;

    if (!this.hasEnd)
      throw new Error('Can not perform then on an endless TransformSequence.');

    // "Then" simply sets the currentTime to endTime to continue where the last transform left off,
    // followed by a subsequent delay call.
    this.currentTime = this.endTime;
    return this.delay(delay, ...(args as TransformSequenceGenerator<T>[]));
  }

  /** Advances the start time of future appended transforms by delay milliseconds. Then appends the given generators. */
  delay(delay: number, ...childGenerators: TransformSequenceGenerator<T>[]): TransformSequence<T> {
    // After a delay statement, future transforms are appended after a currentTime which got offset by a delay.
    this.currentTime += delay;
    return this.append(...childGenerators);
  }

  /** Registers a callback which is invoked once all transforms in this sequence have completed successfully. */
  onComplete(func: (origin: T) => void): void {
    if (!this.hasEnd)
      throw new Error('Can not perform then on an endless TransformSequence.');

    this.subscribeComplete(() => func(this.origin));
  }

  /** Registers a callback which is invoked once any transform in this sequence has been aborted. */
  onAbort(func: (origin: T) => void): void {
    this.subscribeAbort(() => func(this.origin));
  }

  /** Registers a callback which is invoked upon completion or abortion. Infinitely looping sequences only invoke on abort. */
  finally(func: (origin: T) => void): void {
    if (this.hasEnd)
      this.onComplete(func);

    this.onAbort(func);
  }

  transformAborted(): void {
    if (this.transforms.length === 0)
      return;

    // No need for OnAbort events to trigger anymore, since
    // we are already aware of the abortion.
    for (const t of this.transforms) {
      t.abortTargetSequence = null;
      t.completionTargetSequence = null;

      if (!t.hasStartValue)
        t.targetTransformable.removeTransform(t);
    }

    this.transforms.length = 0;
    this.last = null;

    this.onAbortAction?.();
  }

  transformCompleted(): void {
    this.hasCompleted = true;
    this.onCompleteAction?.();
  }
}
