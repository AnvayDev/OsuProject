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
    // (non-layout flags are never stored: they always propagate)
    this.selfInvalidation = this.parentInvalidation = this.childInvalidation = initialState & Invalidation.Layout;
  }

  // (C#'s invalidate/validate helpers return a tuple of struct values; as JS arrays, destructured on every invalidation of every drawable,
  // they allocated and dominated loading and per-frame invalidation, so the same bit operations are written out inline.)

  /** Invalidates a InvalidationSource with given Invalidation flags. Returns whether any invalidation occurred. */
  invalidate(source: InvalidationSource, flags: Invalidation): boolean {
    // Remove all non-layout flags, as they should always propagate and are thus not to be stored.
    const stored = flags & Invalidation.Layout;

    switch (source) {
      case InvalidationSource.Self: {
        const result = (this.selfInvalidation & flags) !== flags;
        this.selfInvalidation |= stored;
        return result;
      }

      case InvalidationSource.Parent: {
        const result = (this.parentInvalidation & flags) !== flags;
        this.parentInvalidation |= stored;
        return result;
      }

      default: {
        const result = (this.childInvalidation & flags) !== flags;
        this.childInvalidation |= stored;
        return result;
      }
    }
  }

  /** Validates all InvalidationSources with given Invalidation flags. Returns whether any InvalidationSource was validated. */
  validate(validation: Invalidation): boolean {
    const result = ((this.selfInvalidation | this.parentInvalidation | this.childInvalidation) & validation) !== 0;
    this.selfInvalidation &= ~validation;
    this.parentInvalidation &= ~validation;
    this.childInvalidation &= ~validation;
    return result;
  }
}
