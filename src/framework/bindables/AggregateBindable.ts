// Ported from osu.Framework/Bindables/AggregateBindable.cs (sources are strongly referenced, like all bindables in this port).

import { Bindable, type ValueChangedEvent } from './Bindable';

export class AggregateBindable<T> {
  private readonly _result: Bindable<T>;

  /** The final result after aggregating all added sources. */
  get result(): Bindable<T> {
    return this._result;
  }

  private readonly initialValue: T;

  /** aggregateFunction: the function to be used for aggregation, taking two input values and returning one output. */
  constructor(private readonly aggregateFunction: (a: T, b: T) => T, resultBindable: Bindable<T> | null = null) {
    this._result = resultBindable ?? new Bindable<T>();
    this.initialValue = this._result.value;
  }

  private readonly sourceMapping: { source: Bindable<T>; boundCopy: Bindable<T> }[] = [];

  /** Add a new source to be included in aggregation. */
  addSource(bindable: Bindable<T>): void {
    if (this.findExistingPair(bindable) !== undefined)
      return;

    const boundCopy = bindable.getBoundCopy();
    this.sourceMapping.push({ source: bindable, boundCopy });
    boundCopy.bindValueChanged(e => this.recalculateAggregate(e), true);
  }

  /** Remove a source from being included in aggregation. */
  removeSource(bindable: Bindable<T>): void {
    const pair = this.findExistingPair(bindable);

    if (pair !== undefined) {
      pair.boundCopy.unbindAll();
      this.sourceMapping.splice(this.sourceMapping.indexOf(pair), 1);
    }

    this.recalculateAggregate();
  }

  private findExistingPair(bindable: Bindable<T>) {
    return this.sourceMapping.find(p => p.source === bindable);
  }

  private recalculateAggregate(_e?: ValueChangedEvent<T>): void {
    let calculated = this.initialValue;

    for (const pair of this.sourceMapping)
      calculated = this.aggregateFunction(calculated, pair.boundCopy.value);

    this._result.value = calculated;
  }

  removeAllSources(): void {
    for (const mapping of [...this.sourceMapping])
      this.removeSource(mapping.source);
  }
}
