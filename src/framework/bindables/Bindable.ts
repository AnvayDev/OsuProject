// Ported from osu.Framework/Bindables/Bindable.cs, ValueChangedEvent.cs, LeasedBindable.cs, BindableBool.cs, BindableWithCurrent.cs
// and IBindable.GetBoundCopyImplementation. Bindings are strong references (C# uses weak references); drawables unbind on disposal.

import { Signal } from './Signal';

/** Ported from ValueChangedEvent.cs */
export interface ValueChangedEvent<T> {
  readonly oldValue: T;
  readonly newValue: T;
}

/** EqualityComparer<T>.Default: value types with Equals (Vector2, Colour4, MarginPadding…) compare structurally. */
export function defaultEquals<T>(a: T, b: T): boolean {
  if (a === b) return true;

  // double.NaN.Equals(double.NaN) is true.
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);

  if (a !== null && b !== null && typeof a === 'object' && typeof (a as { equals?: unknown }).equals === 'function')
    return (a as unknown as { equals(o: T): boolean }).equals(b);

  return false;
}

/** An interface which can be bound to other bindables in order to watch for (and react to) value changes. */
export class Bindable<T> {
  /** An event which is raised when value has changed (or manually via triggerValueChange). */
  readonly valueChanged = new Signal<ValueChangedEvent<T>>();

  /** An event which is raised when disabled has changed (or manually via triggerDisabledChange). */
  readonly disabledChanged = new Signal<boolean>();

  /** An event which is raised when default has changed (or manually via triggerDefaultChange). */
  readonly defaultChanged = new Signal<ValueChangedEvent<T>>();

  private _value: T;
  private _defaultValue!: T;
  private _disabled = false;

  /** Whether this bindable has been disabled. When disabled, attempting to change the value will result in an error. */
  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    // if a lease is active, disabled can *only* be changed by that leased bindable.
    this.throwIfLeased();

    if (this._disabled === value) return;

    this.setDisabled(value);
  }

  /** @internal */
  setDisabled(value: boolean, bypassChecks = false, source: Bindable<T> | null = null): void {
    if (!bypassChecks)
      this.throwIfLeased();

    this._disabled = value;
    this.triggerDisabledChange(source ?? this, true, bypassChecks);
  }

  /** Check whether the current value is equal to the default value. */
  get isDefault(): boolean {
    return defaultEquals(this._value, this.default);
  }

  /** Revert the current value to the defined default value. */
  setDefault(): void {
    this.value = this.default;
  }

  /** The current value of this bindable. */
  get value(): T {
    return this._value;
  }

  set value(value: T) {
    // intentionally don't have throwIfLeased() here.
    // if the leased bindable decides to disable exclusive access (by setting Disabled = false) then anything will be able to write to Value.

    if (this.disabled)
      throw new Error(`Can not set value to "${String(value)}" as bindable is disabled.`);

    if (defaultEquals(this._value, value)) return;

    this.setValue(this._value, value);
  }

  /** @internal */
  setValue(previousValue: T, value: T, bypassChecks = false, source: Bindable<T> | null = null): void {
    this._value = value;
    this.triggerValueChange(previousValue, source ?? this, true, bypassChecks);
  }

  /** The default value of this bindable. Used when calling setDefault or querying isDefault. */
  get default(): T {
    return this._defaultValue;
  }

  set default(value: T) {
    if (this.disabled)
      throw new Error(`Can not set default value to "${String(value)}" as bindable is disabled.`);

    if (defaultEquals(this._defaultValue, value)) return;

    this.setDefaultValue(this._defaultValue, value);
  }

  /** @internal */
  setDefaultValue(previousValue: T, value: T, bypassChecks = false, source: Bindable<T> | null = null): void {
    this._defaultValue = value;
    this.triggerDefaultChange(previousValue, source ?? this, true, bypassChecks);
  }

  /** Creates a new bindable instance initialised with a default value. */
  constructor(defaultValue: T = undefined as T) {
    this._value = defaultValue;
    this.default = defaultValue;
  }

  protected bindings: Bindable<T>[] | null = null;

  /** An alias of bindTo provided for use in object initializer scenarios. */
  set bindTarget(value: Bindable<T>) {
    this.bindTo(value);
  }

  /** Copies all values and value limitations of this bindable to another. */
  copyTo(them: Bindable<T>): void {
    them.value = this.value;
    them.default = this.default;
    them.disabled = this.disabled;
  }

  /** Binds this bindable to another such that bi-directional updates are propagated. This will adopt any values and value limitations of the bindable bound to. */
  bindTo(them: Bindable<T>): void {
    if (this.bindings?.includes(them) === true)
      throw new Error('An already bound bindable cannot be bound again.');

    them.copyTo(this);

    this.addBinding(them);
    them.addBinding(this);
  }

  /** Bind an action to valueChanged with the option of running the bound action once immediately. */
  bindValueChanged(onChange: (e: ValueChangedEvent<T>) => void, runOnceImmediately = false): void {
    this.valueChanged.add(onChange);

    if (runOnceImmediately)
      onChange({ oldValue: this.value, newValue: this.value });
  }

  /** Bind an action to disabledChanged with the option of running the bound action once immediately. */
  bindDisabledChanged(onChange: (disabled: boolean) => void, runOnceImmediately = false): void {
    this.disabledChanged.add(onChange);

    if (runOnceImmediately)
      onChange(this.disabled);
  }

  private addBinding(b: Bindable<T>): void {
    (this.bindings ??= []).push(b);
  }

  private removeBinding(b: Bindable<T>): void {
    if (this.bindings === null) return;

    const i = this.bindings.indexOf(b);
    if (i >= 0) this.bindings.splice(i, 1);
  }

  /** Parse an input into this instance (strings, other bindables or values). */
  parse(input: unknown): void {
    if (input instanceof Bindable) {
      this.value = input.value as T;
      return;
    }

    this.value = input as T;
  }

  /** Raise valueChanged and disabledChanged once, without any changes actually occurring. This does not propagate to any outward bound bindables. */
  triggerChange(): void {
    this.triggerValueChange(this._value, this, false);
    this.triggerDisabledChange(this, false);
  }

  protected triggerValueChange(previousValue: T, source: Bindable<T>, propagateToBindings = true, bypassChecks = false): void {
    // check a bound bindable hasn't changed the value again (it will fire its own event)
    const beforePropagation = this._value;

    if (propagateToBindings && this.bindings !== null) {
      for (const b of [...this.bindings]) {
        if (b === source) continue;

        b.setValue(previousValue, this._value, bypassChecks, this);
      }
    }

    if (defaultEquals(beforePropagation, this._value))
      this.valueChanged.emit({ oldValue: previousValue, newValue: this._value });
  }

  protected triggerDefaultChange(previousValue: T, source: Bindable<T>, propagateToBindings = true, bypassChecks = false): void {
    // check a bound bindable hasn't changed the value again (it will fire its own event)
    const beforePropagation = this._defaultValue;

    if (propagateToBindings && this.bindings !== null) {
      for (const b of [...this.bindings]) {
        if (b === source) continue;

        b.setDefaultValue(previousValue, this._defaultValue, bypassChecks, this);
      }
    }

    if (defaultEquals(beforePropagation, this._defaultValue))
      this.defaultChanged.emit({ oldValue: previousValue, newValue: this._defaultValue });
  }

  protected triggerDisabledChange(source: Bindable<T>, propagateToBindings = true, bypassChecks = false): void {
    // check a bound bindable hasn't changed the value again (it will fire its own event)
    const beforePropagation = this._disabled;

    if (propagateToBindings && this.bindings !== null) {
      for (const b of [...this.bindings]) {
        if (b === source) continue;

        b.setDisabled(this._disabled, bypassChecks, this);
      }
    }

    if (beforePropagation === this._disabled)
      this.disabledChanged.emit(this._disabled);
  }

  /** Unbinds any actions bound to the value changed events. */
  unbindEvents(): void {
    this.valueChanged.clear();
    this.defaultChanged.clear();
    this.disabledChanged.clear();
  }

  /** Remove all bound bindables via getBoundCopy or bindTo. */
  unbindBindings(): void {
    if (this.bindings === null)
      return;

    for (const b of [...this.bindings])
      this.unbindFrom(b);
  }

  /** Calls unbindEvents and unbindBindings. Also returns any active lease. */
  unbindAll(): void {
    this.unbindAllInternal();
  }

  /** @internal */
  unbindAllInternal(): void {
    if (this.leasedBindable !== null)
      this.leasedBindable.return();

    this.unbindEvents();
    this.unbindBindings();
  }

  /** Unbinds ourselves from another bindable such that we stop receiving its events. */
  unbindFrom(them: Bindable<T>): void {
    this.removeBinding(them);
    them.removeBinding(this);
  }

  /** A short readable description of this bindable. */
  description = '';

  /** C# object-initializer equivalent (`new BindableDouble { MinValue = 0, Value = 1 }`): assigns in order and returns this. */
  with(props: Partial<Omit<this, 'with'>>): this {
    Object.assign(this, props);
    return this;
  }

  toString(): string {
    return String(this.value);
  }

  /** Create an unbound clone of this bindable. */
  getUnboundCopy(): this {
    const newBindable = this.createInstance();
    this.copyTo(newBindable);
    return newBindable as this;
  }

  /** Creates a new instance of this bindable for use in getBoundCopy and getUnboundCopy. Override for subclasses with constructor arguments. */
  protected createInstance(): Bindable<T> {
    return new (this.constructor as new () => Bindable<T>)();
  }

  /** Retrieve a new bindable instance weakly bound to the configuration backing. */
  getBoundCopy(): this {
    const copy = this.createInstance();

    if (copy.constructor !== this.constructor)
      throw new Error(`Attempted to create a copy of ${this.constructor.name}, but the returned instance type was ${copy.constructor.name}. Override createInstance() for getBoundCopy() to function properly.`);

    copy.bindTo(this);
    return copy as this;
  }

  private leasedBindable: LeasedBindable<T> | null = null;

  /**
   * Takes out a mutually exclusive lease on this bindable. During a lease, the bindable will be set to disabled,
   * but changes can still be applied via the returned LeasedBindable. Call return() on it to end the lease.
   */
  beginLease(revertValueOnReturn: boolean): LeasedBindable<T> {
    if (this.checkForLease(this))
      throw new Error('Attempted to lease a bindable that is already in a leased state.');

    return this.leasedBindable = new LeasedBindable<T>(this, revertValueOnReturn);
  }

  private checkForLease(source: Bindable<T>): boolean {
    if (this.leasedBindable !== null)
      return true;

    if (this.bindings === null)
      return false;

    let found = false;

    for (const b of this.bindings) {
      if (b !== source)
        found = b.checkForLease(this) || found;
    }

    return found;
  }

  /** @internal Called internally by a LeasedBindable to end a lease. */
  endLease(returnedBindable: LeasedBindable<T>): void {
    if (this.leasedBindable === null)
      throw new Error('Attempted to end a lease without beginning one.');

    if (returnedBindable !== this.leasedBindable)
      throw new Error('Attempted to end a lease but returned a different bindable to the one used to start the lease.');

    this.leasedBindable = null;
  }

  private throwIfLeased(): void {
    if (this.leasedBindable !== null)
      throw new Error('Cannot perform this operation on a Bindable<T> that is currently in a leased state.');
  }
}

/** A bindable carrying a mutually exclusive lease on another bindable. Can only be retrieved via Bindable.beginLease. */
export class LeasedBindable<T> extends Bindable<T> {
  private readonly source: Bindable<T> | null = null;

  private readonly valueBeforeLease!: T;
  private readonly disabledBeforeLease: boolean = false;
  private readonly revertValueOnReturn: boolean = false;

  /** @internal Use Bindable.beginLease. Without a source (getBoundCopy), behaves like a plain bindable. */
  constructor(source?: Bindable<T>, revertValueOnReturn = false) {
    super();

    if (source === undefined)
      return; // used for GetBoundCopy, where we don't want a source.

    this.bindTo(source);

    this.source = source;

    if (revertValueOnReturn) {
      this.revertValueOnReturn = true;
      this.valueBeforeLease = this.value;
    }

    this.disabledBeforeLease = this.disabled;

    this.disabled = true;
  }

  private hasBeenReturned = false;

  /** End the lease on the source Bindable. Returns whether the lease was returned by this call (false if already returned). */
  return(): boolean {
    if (this.hasBeenReturned)
      return false;

    if (this.source === null)
      throw new Error('Must Return from original leased source');

    this.unbindAll();
    return true;
  }

  override get value(): T {
    return super.value;
  }

  override set value(value: T) {
    if (this.source !== null)
      this.checkValid();

    if (defaultEquals(this.value, value)) return;

    this.setValue(super.value, value, true);
  }

  override get default(): T {
    return super.default;
  }

  override set default(value: T) {
    if (this.source != null)
      this.checkValid();

    if (defaultEquals(this.default, value)) return;

    this.setDefaultValue(super.default, value, true);
  }

  override get disabled(): boolean {
    return super.disabled;
  }

  override set disabled(value: boolean) {
    if (this.source != null)
      this.checkValid();

    if (this.disabled === value) return;

    this.setDisabled(value, true);
  }

  override unbindAllInternal(): void {
    if (this.source !== null && !this.hasBeenReturned) {
      if (this.revertValueOnReturn)
        this.value = this.valueBeforeLease;

      this.disabled = this.disabledBeforeLease;

      this.source.endLease(this);
      this.hasBeenReturned = true;
    }

    super.unbindAllInternal();
  }

  protected override createInstance(): Bindable<T> {
    return new LeasedBindable<T>();
  }

  private checkValid(): void {
    if (this.source !== null && this.hasBeenReturned)
      throw new Error('Cannot perform operations on a LeasedBindable that has been Returned.');
  }
}

/** Ported from BindableBool.cs */
export class BindableBool extends Bindable<boolean> {
  constructor(value = false) {
    super(value);
  }

  override parse(input: unknown): void {
    if (input == null) throw new Error('input may not be null.');

    if (input === '1')
      this.value = true;
    else if (input === '0')
      this.value = false;
    else if (input === 'true' || input === 'True')
      this.value = true;
    else if (input === 'false' || input === 'False')
      this.value = false;
    else
      super.parse(input);
  }

  toggle(): void {
    this.value = !this.value;
  }
}

/** A bindable which holds a reference to a bound target, allowing switching between targets and handling unbind/rebind. */
export class BindableWithCurrent<T> extends Bindable<T> {
  private currentBound: Bindable<T> | null = null;

  get current(): Bindable<T> {
    return this;
  }

  set current(value: Bindable<T>) {
    if (value == null) throw new Error('value may not be null.');

    if (this.currentBound !== null) this.unbindFrom(this.currentBound);
    this.bindTo(this.currentBound = value);
  }
}
