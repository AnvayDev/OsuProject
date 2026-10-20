// Ported from osu.Framework/Lists/SortedList.cs (the subset used by the framework)

export class SortedList<T> {
  private readonly list: T[] = [];

  constructor(readonly comparer: (x: T, y: T) => number) {}

  get count(): number {
    return this.list.length;
  }

  get(index: number): T {
    return this.list[index];
  }

  /** Inserts at the binary search position (same as C# List.BinarySearch + Insert) and returns the index. */
  add(value: T): number {
    let index = this.binarySearch(value);
    if (index < 0)
      index = ~index;

    this.list.splice(index, 0, value);

    return index;
  }

  removeAt(index: number): void {
    this.list.splice(index, 1);
  }

  remove(item: T): boolean {
    const index = this.indexOf(item);
    if (index < 0)
      return false;

    this.removeAt(index);
    return true;
  }

  removeAll(match: (item: T) => boolean): number {
    let removed = 0;

    for (let i = 0; i < this.list.length; i++) {
      if (match(this.list[i])) {
        this.list.splice(i--, 1);
        removed++;
      }
    }

    return removed;
  }

  contains(item: T): boolean {
    return this.indexOf(item) >= 0;
  }

  indexOf(value: T): number {
    return this.binarySearch(value);
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.list.filter(predicate);
  }

  toArray(): readonly T[] {
    return this.list;
  }

  /** Same contract as C# List.BinarySearch: index of a match, or the bitwise complement of the next larger element's index. */
  binarySearch(value: T): number {
    let lo = 0;
    let hi = this.list.length - 1;

    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      const c = this.comparer(this.list[mid], value);

      if (c === 0) return mid;
      if (c < 0) lo = mid + 1;
      else hi = mid - 1;
    }

    return ~lo;
  }
}
