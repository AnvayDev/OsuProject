// Ported from osu.Game/Database/Live.cs (with RealmLive / RealmLiveUnmanaged): a reference to a stored model by ID, read and written through
// RealmAccess so that the latest committed version is always used.

export class Live<T extends { readonly id: string }> {
  private constructor(
    readonly id: string,
    private readonly read: () => T | null,
    private readonly write: ((action: (t: T) => void) => Promise<void>) | null,
  ) {}

  /** (RealmLive) */
  static managed<T extends { readonly id: string }>(id: string, read: () => T | null, write: (action: (t: T) => void) => Promise<void>): Live<T> {
    return new Live(id, read, write);
  }

  /** (RealmLiveUnmanaged / ToLiveUnmanaged: a model which isn't stored) */
  static unmanaged<T extends { readonly id: string }>(value: T): Live<T> {
    return new Live(value.id, () => value, null);
  }

  /** Whether this instance is tracking data which is managed by the database backing. */
  get isManaged(): boolean {
    return this.write !== null;
  }

  /** Whether the model still exists (realm's IsValid). */
  get isValid(): boolean {
    return this.read() !== null;
  }

  /** The latest version of the model. */
  get value(): T {
    const v = this.read();
    if (v === null)
      throw new Error(`The model ${this.id} is no longer stored.`);
    return v;
  }

  /** Perform a read operation on this live object. */
  performRead<TReturn>(perform: (t: T) => TReturn): TReturn {
    return perform(this.value);
  }

  /** Perform a write operation on this live object (on a writable copy, committed when the action returns). */
  performWrite(perform: (t: T) => void): Promise<void> {
    if (this.write === null)
      throw new Error('Can\'t write to an unmanaged instance.');

    return this.write(perform);
  }

  /** (IEquatable<Live<T>>: by ID) */
  equals(other: Live<T> | null): boolean {
    return other !== null && other.id === this.id;
  }
}
