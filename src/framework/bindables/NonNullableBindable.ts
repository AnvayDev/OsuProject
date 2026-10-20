// Ported from osu.Framework/Bindables/NonNullableBindable.cs

import { Bindable } from './Bindable';

export class NonNullableBindable<T extends object> extends Bindable<T> {
  constructor(defaultValue?: T) {
    super();

    // The parameterless constructor is C#'s private one, used by createInstance.
    if (arguments.length === 0)
      return;

    if (defaultValue == null)
      throw new Error('defaultValue may not be null.');

    this.value = this.default = defaultValue;
  }

  override get value(): T {
    return super.value;
  }

  override set value(value: T) {
    if (value == null)
      throw new Error('Cannot set value of a NonNullableBindable to null.');

    super.value = value;
  }

  protected override createInstance(): Bindable<T> {
    return new NonNullableBindable<T>();
  }
}
