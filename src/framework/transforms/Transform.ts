// Ported from osu.Framework/Graphics/Transforms/Transform.cs
// osu!framework's Transform, Transform<TValue> and Transform<TValue, TEasing, T> are collapsed into one generic class
// (TypeScript cannot overload a class name by generic arity).

import type { IEasingFunction } from './Easing';
import type { ITransformSequence } from './ITransformSequence';
import type { Transformable } from './Transformable';

export abstract class Transform<TValue = unknown, T extends Transformable = Transformable> {
  /** @internal */ transformID = 0;

  /** Whether this transform has been applied at least once. @internal */
  applied = false;

  /** Whether this transform has been applied with a time value beyond its end time. @internal */
  appliedToEnd = false;

  /** Whether this transform can be rewound. */
  rewindable = true;

  startTime = 0;
  endTime = 0;

  get isLooping(): boolean {
    return this.loopCount === -1 || this.loopCount > 0;
  }

  loopDelay = 0;

  loopCount = 0;

  /** The name of the property which this transform targets. */
  abstract get targetMember(): string;

  /** A name which allows this transform to be grouped with other transforms of a similar nature (e.g. X/Y with Position). */
  get targetGrouping(): string {
    return this.targetMember;
  }

  /** @internal */ hasStartValue = false;

  /** @internal */ completionTargetSequence: ITransformSequence | null = null;

  /** @internal */ abortTargetSequence: ITransformSequence | null = null;

  startValue!: TValue;
  endValue!: TValue;

  target: T | null = null;

  easing!: IEasingFunction;

  get targetTransformable(): T {
    return this.target!;
  }

  apply(time: number): void {
    this.applyTo(this.target!, time);
    this.applied = true;
  }

  readIntoStartValue(): void {
    this.readIntoStartValueFrom(this.target!);
  }

  protected abstract applyTo(d: T, time: number): void;

  protected abstract readIntoStartValueFrom(d: T): void;

  /** Equivalent of C#'s MemberwiseClone. */
  clone(): Transform<TValue, T> {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }

  static readonly COMPARER = (x: Transform<any, any>, y: Transform<any, any>): number => {
    const compare = x.startTime - y.startTime;
    if (compare !== 0) return compare < 0 ? -1 : 1;

    return x.transformID === y.transformID ? 0 : x.transformID < y.transformID ? -1 : 1;
  };

  /** @internal */ triggerComplete(): void {
    this.completionTargetSequence?.transformCompleted();
  }

  /** @internal */ triggerAbort(): void {
    this.abortTargetSequence?.transformAborted();
  }

  toString(): string {
    return `${this.target?.constructor.name}.${this.targetMember} ${this.startTime.toFixed(3)}-${this.endTime.toFixed(3)}ms ${this.startValue} -> ${this.endValue}`;
  }
}
