// Ported from osu.Framework/Configuration/ConfigManager.cs
// C# overloads SetDefault by value type; here the numeric and bool overloads are setDefaultDouble/Float/Int/Bool and the generic one is
// setDefault. Lookups are string enums, so a stored key is the setting's name, as in C#. Tracked settings (on-screen display) are not ported.

import { Bindable, BindableBool } from '../bindables/Bindable';
import { BindableDouble, BindableFloat, BindableInt, type BindableNumber } from '../bindables/BindableNumber';

export abstract class ConfigManagerBase {
  private hasLoaded = false;

  load(): void {
    this.performLoad();
    this.hasLoaded = true;
  }

  private lastSave = 0;

  /** Queues a save 100 ms from now; a later queued save supersedes it. */
  protected queueBackgroundSave(): void {
    const current = ++this.lastSave;

    setTimeout(() => {
      if (current === this.lastSave) this.save();
    }, 100);
  }

  /** Saves this configuration. Returns whether the operation succeeded. */
  save(): boolean {
    if (!this.hasLoaded) return false;

    this.lastSave++;
    return this.performSave();
  }

  protected abstract performLoad(): void;

  protected abstract performSave(): boolean;

  private isDisposed = false;

  dispose(): void {
    if (!this.isDisposed) {
      this.save();
      this.isDisposed = true;
    }
  }
}

export abstract class ConfigManager<TLookup extends string> extends ConfigManagerBase {
  /** Whether entries which are not yet defined by InitialiseDefaults() should be added to the config store when read. */
  protected get addMissingEntries(): boolean {
    return true;
  }

  protected readonly configStore = new Map<TLookup, Bindable<unknown>>();

  protected constructor(private readonly defaultOverrides: ReadonlyMap<TLookup, unknown> | null = null) {
    super();
  }

  /** Initialise all config defaults here. */
  protected initialiseDefaults(): void {
  }

  /** Set a value. Will create a new bindable if a default has not been set. */
  setValue<TValue>(lookup: TLookup, value: TValue): void {
    const bindable = this.getOriginalBindable<TValue>(lookup);

    if (bindable === null)
      this.setDefault(lookup, value);
    else
      bindable.value = value;
  }

  protected setDefaultDouble(lookup: TLookup, value: number, min?: number, max?: number, precision?: number): BindableDouble {
    return this.setDefaultNumber(lookup, value, BindableDouble, min, max, precision);
  }

  protected setDefaultFloat(lookup: TLookup, value: number, min?: number, max?: number, precision?: number): BindableFloat {
    return this.setDefaultNumber(lookup, value, BindableFloat, min, max, precision);
  }

  protected setDefaultInt(lookup: TLookup, value: number, min?: number, max?: number): BindableInt {
    return this.setDefaultNumber(lookup, value, BindableInt, min, max);
  }

  private setDefaultNumber<TBindable extends BindableNumber>(lookup: TLookup, value: number, type: new (value: number) => TBindable,
                                                             min?: number, max?: number, precision?: number): TBindable {
    value = this.getDefault(lookup, value);

    let bindable = this.getOriginalBindable<number>(lookup);

    if (!(bindable instanceof type)) {
      bindable = new type(value);
      this.addBindable(lookup, bindable);
    } else
      bindable.value = value;

    const b = bindable as TBindable;

    b.default = value;
    if (min !== undefined) b.minValue = min;
    if (max !== undefined) b.maxValue = max;
    if (precision !== undefined) b.precision = precision;

    return b;
  }

  protected setDefaultBool(lookup: TLookup, value: boolean): BindableBool {
    value = this.getDefault(lookup, value);

    let bindable = this.getOriginalBindable<boolean>(lookup);

    if (!(bindable instanceof BindableBool)) {
      bindable = new BindableBool(value);
      this.addBindable(lookup, bindable);
    } else
      bindable.value = value;

    bindable.default = value;

    return bindable as BindableBool;
  }

  protected setDefault<TValue>(lookup: TLookup, value: TValue): Bindable<TValue> {
    value = this.getDefault(lookup, value);

    let bindable = this.getOriginalBindable<TValue>(lookup);

    if (bindable === null)
      bindable = this.set(lookup, value);
    else
      bindable.value = value;

    bindable.default = value;

    return bindable;
  }

  protected addBindable<TBindable>(lookup: TLookup, bindable: Bindable<TBindable>): void {
    this.configStore.set(lookup, bindable as Bindable<unknown>);
    bindable.valueChanged.add(() => this.queueBackgroundSave());
  }

  private getDefault<TValue>(lookup: TLookup, fallback: TValue): TValue {
    if (this.defaultOverrides?.has(lookup))
      return this.defaultOverrides.get(lookup) as TValue;

    return fallback;
  }

  private set<TValue>(lookup: TLookup, value: TValue): Bindable<TValue> {
    const bindable = new Bindable<TValue>(value);
    this.addBindable(lookup, bindable);
    return bindable;
  }

  get<TValue>(lookup: TLookup): TValue {
    return this.getOriginalBindable<TValue>(lookup)!.value;
  }

  protected getOriginalBindable<TValue>(lookup: TLookup): Bindable<TValue> | null {
    return (this.configStore.get(lookup) as Bindable<TValue> | undefined) ?? null;
  }

  /** Retrieve a bindable. This will be a new instance weakly bound to the configuration backing. If you are further binding to events of a bindable retrieved using this method, ensure to hold a local reference. */
  getBindable<TValue>(lookup: TLookup): Bindable<TValue> {
    return this.getOriginalBindable<TValue>(lookup)!.getBoundCopy();
  }

  /** Binds a local bindable with a configuration-backed bindable. */
  bindWith<TValue>(lookup: TLookup, bindable: Bindable<TValue>): void {
    bindable.bindTo(this.getOriginalBindable<TValue>(lookup)!);
  }
}
