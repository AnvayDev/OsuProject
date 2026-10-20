// Ported from osu.Framework/Layout/InvalidationSource.cs, LayoutMember.cs, LayoutValue.cs
// and osu.Framework/Graphics/InvalidationList.cs.

import type { Drawable } from '../graphics/Drawable';
import { Invalidation } from './Enums';

export enum InvalidationSource {
  /** The Drawable itself. */
  Self = 1,

  /** The parent of the Drawable. */
  Parent = 1 << 1,

  /** A child of the Drawable. */
  Child = 1 << 2,

  /** Self | Parent (the default). */
  Default = Self | Parent,
}

/** Whether the layout member should be invalidated for the given source drawable and invalidation. */
export type InvalidationConditionDelegate = (source: Drawable, invalidation: Invalidation) => boolean;

/** A member that represents a part of the layout of a Drawable. Can be invalidated and validated. */
export abstract class LayoutMember {
  /** @internal */ parent: Drawable | null = null;
  /** @internal */ next: LayoutMember | null = null;

  constructor(
    readonly invalidation: Invalidation,
    readonly source: InvalidationSource = InvalidationSource.Default,
    readonly conditions: InvalidationConditionDelegate | null = null,
  ) {}

  get isValid(): boolean {
    return this._isValid;
  }

  private _isValid = false;

  /** Invalidates this member. Returns whether the member was invalidated (false if already invalid). */
  invalidate(): boolean {
    if (!this._isValid)
      return false;

    this._isValid = false;
    return true;
  }

  protected validateMember(): void {
    if (this._isValid)
      return;

    this._isValid = true;
    this.parent?.validateSuperTree(this.invalidation);
  }
}

/** A layout member with no value (LayoutValue in C#). */
export class LayoutValue extends LayoutMember {
  validate(): void {
    this.validateMember();
  }
}

/** A layout member that caches a value (LayoutValue<T> in C#). */
export class LayoutValueOf<T> extends LayoutMember {
  private _value!: T;

  get value(): T {
    if (!this.isValid)
      throw new Error('May not query Value of an invalid LayoutValue<T>.');

    return this._value;
  }

  set value(value: T) {
    this._value = value;
    this.validateMember();
  }
}

/** @internal Tracks self/parent/child invalidation states (struct InvalidationList in C#). */
export class InvalidationList {
  private selfInvalidation = Invalidation.None;
  private parentInvalidation = Invalidation.None;
  private childInvalidation = Invalidation.None;

  constructor(initialState: Invalidation) {
    this.selfInvalidation = InvalidationList.invalidateFlags(this.selfInvalidation, initialState)[1];
    this.parentInvalidation = InvalidationList.invalidateFlags(this.parentInvalidation, initialState)[1];
    this.childInvalidation = InvalidationList.invalidateFlags(this.childInvalidation, initialState)[1];
  }

  /** Invalidates a InvalidationSource with given Invalidation flags. Returns whether any invalidation occurred. */
  invalidate(source: InvalidationSource, flags: Invalidation): boolean {
    let result: boolean;

    switch (source) {
      case InvalidationSource.Self:
        [result, this.selfInvalidation] = InvalidationList.invalidateFlags(this.selfInvalidation, flags);
        return result;

      case InvalidationSource.Parent:
        [result, this.parentInvalidation] = InvalidationList.invalidateFlags(this.parentInvalidation, flags);
        return result;

      default:
        [result, this.childInvalidation] = InvalidationList.invalidateFlags(this.childInvalidation, flags);
        return result;
    }
  }

  /** Validates all InvalidationSources with given Invalidation flags. Returns whether any InvalidationSource was validated. */
  validate(validation: Invalidation): boolean {
    let a: boolean, b: boolean, c: boolean;
    [a, this.selfInvalidation] = InvalidationList.validateFlags(this.selfInvalidation, validation);
    [b, this.parentInvalidation] = InvalidationList.validateFlags(this.parentInvalidation, validation);
    [c, this.childInvalidation] = InvalidationList.validateFlags(this.childInvalidation, validation);
    return a || b || c;
  }

  private static invalidateFlags(target: Invalidation, flags: Invalidation): [boolean, Invalidation] {
    // Remove all non-layout flags, as they should always propagate and are thus not to be stored.
    const result = target | (flags & Invalidation.Layout);
    return [(target & flags) !== flags, result];
  }

  private static validateFlags(target: Invalidation, flags: Invalidation): [boolean, Invalidation] {
    const result = target & ~flags;
    return [(target & flags) !== 0, result];
  }
}
