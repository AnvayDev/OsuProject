// Ported from osu.Game/Rulesets/Objects/HitObjectProperty.cs

import { Bindable } from '@fw/bindables/Bindable';

/** Represents a wrapper containing a lazily-initialised Bindable, backed by a temporary field used for value storage until initialisation. */
export class HitObjectProperty<T> {
  private backingBindable: Bindable<T> | null = null;

  private backingValue: T;

  constructor(private readonly defaultValue: T) {
    this.backingValue = defaultValue;
  }

  /** The underlying Bindable, only initialised on first access. */
  get bindable(): Bindable<T> {
    if (this.backingBindable === null) {
      this.backingBindable = new Bindable<T>(this.defaultValue);
      this.backingBindable.value = this.backingValue;
    }

    return this.backingBindable;
  }

  /** The current value, derived from and delegated to bindable if initialised, or a temporary field otherwise. */
  get value(): T {
    return this.backingBindable !== null ? this.backingBindable.value : this.backingValue;
  }

  set value(value: T) {
    if (this.backingBindable !== null)
      this.backingBindable.value = value;
    else
      this.backingValue = value;
  }
}
