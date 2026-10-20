// Ported from osu.Framework/Lists/ObservableArray.cs and INotifyArrayChanged.cs
// C# indexer `array[i]` / `array[i] = v` → `array.get(i)` / `array.set(i, v)`.

import { Signal } from '../bindables/Signal';

/** Provides an event for notifying about array elements changing. */
export interface INotifyArrayChanged {
  /** Invoked when an element of an array is changed. */
  readonly arrayElementChanged: Signal;
}

const isNotifier = (value: unknown): value is INotifyArrayChanged =>
  typeof value === 'object' && value !== null && (value as Partial<INotifyArrayChanged>).arrayElementChanged instanceof Signal;

/** A wrapper for an array that provides notifications when elements are changed. */
export class ObservableArray<T> implements Iterable<T>, INotifyArrayChanged {
  /** Invoked when an element of the array is changed via set(). */
  readonly arrayElementChanged = new Signal();

  private readonly wrappedArray: T[];

  constructor(arrayToWrap: T[]) {
    this.wrappedArray = arrayToWrap;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.wrappedArray[Symbol.iterator]();
  }

  equals(other: ObservableArray<T> | null): boolean {
    if (other === null) return false;
    if (this === other) return true;

    return this.wrappedArray === other.wrappedArray;
  }

  get count(): number {
    return this.wrappedArray.length;
  }

  get(index: number): T {
    return this.wrappedArray[index];
  }

  set(index: number, value: T): void {
    if (this.wrappedArray[index] === value)
      return;

    const previousValue = this.wrappedArray[index];
    if (isNotifier(previousValue))
      previousValue.arrayElementChanged.remove(this.onArrayElementChanged);

    this.wrappedArray[index] = value;
    if (isNotifier(value))
      value.arrayElementChanged.add(this.onArrayElementChanged);

    this.onArrayElementChanged();
  }

  protected readonly onArrayElementChanged = (): void => {
    this.arrayElementChanged.emit();
  };
}
