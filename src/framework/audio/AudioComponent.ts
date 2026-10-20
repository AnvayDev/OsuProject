// Ported from osu.Framework/Audio/AudioComponent.cs, AdjustableAudioComponent.cs, AudioAdjustments.cs, IAggregateAudioAdjustment.cs and
// AggregateAdjustmentExtensions.cs.
// The browser is single-threaded, which is osu!framework's ExecutionMode.SingleThread: CanPerformInline is always true, so EnqueueAction runs
// inline. Only Dispose() is deferred to the next Update(), as in osu!. C#'s protected Dispose(bool) is onDispose(disposing).

import { AggregateBindable } from '../bindables/AggregateBindable';
import type { Bindable } from '../bindables/Bindable';
import { BindableDouble } from '../bindables/BindableNumber';

/** A base class for audio components which offers audio thread deferring, disposal and basic update logic. */
export abstract class AudioComponent {
  /** Audio operations would run on a separate thread in osu!; here only deferred disposal is queued. */
  protected readonly pendingActions: (() => void)[] = [];

  /** Enqueues an action to be performed on the audio thread (inline: CanPerformInline). */
  protected enqueueAction(action: () => void): Promise<void> {
    action();
    return Promise.resolve();
  }

  /** Run each loop of the audio thread's execution after queued actions are completed to allow components to perform any additional operations. */
  protected updateState(): void {
  }

  /** Run each loop of the audio thread's execution, after updateState as a way to update any child components. */
  protected updateChildren(): void {
  }

  /** Updates this audio component. Always runs on the audio thread. */
  update(): void {
    if (this._isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    while (!this._isDisposed && this.pendingActions.length > 0)
      this.pendingActions.shift()!();

    if (!this._isDisposed)
      this.updateState();

    this.updateChildren();
  }

  /** Whether this component has completed playback and is in a stopped state. */
  get hasCompleted(): boolean {
    return !this.isAlive;
  }

  /** When false, this component has completed all processing and is ready to be removed from its parent. */
  get isAlive(): boolean {
    return !this._isDisposed;
  }

  /** Whether this component has finished loading its resources. */
  get isLoaded(): boolean {
    return true;
  }

  private _isDisposed = false;

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    this.pendingActions.push(() => this.onDispose(true));
  }

  protected onDispose(_disposing: boolean): void {
    this._isDisposed = true;
  }
}

export enum AdjustableProperty {
  Volume,
  Balance,
  Frequency,
  Tempo,
}

const all_adjustments = [AdjustableProperty.Volume, AdjustableProperty.Balance, AdjustableProperty.Frequency, AdjustableProperty.Tempo];

/** Provides aggregated adjustments for an audio component. */
export interface IAggregateAudioAdjustment {
  /** The aggregate volume of this component (0..1 range, combination of volume and all children). */
  readonly aggregateVolume: Bindable<number>;
  /** The aggregate balance of this component (-1..1 range). */
  readonly aggregateBalance: Bindable<number>;
  /** The aggregate frequency of this component. */
  readonly aggregateFrequency: Bindable<number>;
  /** The aggregate tempo of this component. */
  readonly aggregateTempo: Bindable<number>;
}

/** AggregateAdjustmentExtensions.GetAggregate */
export function getAggregate(adjustment: IAggregateAudioAdjustment, type: AdjustableProperty): Bindable<number> {
  switch (type) {
    case AdjustableProperty.Volume:
      return adjustment.aggregateVolume;

    case AdjustableProperty.Balance:
      return adjustment.aggregateBalance;

    case AdjustableProperty.Frequency:
      return adjustment.aggregateFrequency;

    case AdjustableProperty.Tempo:
      return adjustment.aggregateTempo;
  }
}

export interface IAdjustableAudioComponent extends IAggregateAudioAdjustment {
  readonly volume: BindableDouble;
  readonly balance: BindableDouble;
  readonly frequency: BindableDouble;
  readonly tempo: BindableDouble;

  addAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void;
  removeAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void;
  removeAllAdjustments(type: AdjustableProperty): void;
  bindAdjustments(component: IAggregateAudioAdjustment): void;
  unbindAdjustments(component: IAggregateAudioAdjustment): void;
}

export const isAdjustableAudioComponent = (c: object): c is IAdjustableAudioComponent =>
  typeof (c as Partial<IAdjustableAudioComponent>).bindAdjustments === 'function';

export class AudioAdjustments implements IAdjustableAudioComponent {
  /** The volume of this component. */
  readonly volume = new BindableDouble(1).with({ default: 1, minValue: 0, maxValue: 1 });

  /** The playback balance of this sample (-1 .. 1 where 0 is centered) */
  readonly balance = new BindableDouble().with({ minValue: -1, maxValue: 1 });

  /** Rate at which the component is played back (affects pitch). 1 is 100% playback speed, or default frequency. */
  readonly frequency = new BindableDouble(1).with({ default: 1 });

  /** Rate at which the component is played back (does not affect pitch). 1 is 100% playback speed. */
  readonly tempo = new BindableDouble(1).with({ default: 1 });

  get aggregateVolume(): Bindable<number> { return this.volumeAggregate.result; }
  get aggregateBalance(): Bindable<number> { return this.balanceAggregate.result; }
  get aggregateFrequency(): Bindable<number> { return this.frequencyAggregate.result; }
  get aggregateTempo(): Bindable<number> { return this.tempoAggregate.result; }

  private readonly volumeAggregate: AggregateBindable<number>;
  private readonly balanceAggregate: AggregateBindable<number>;
  private readonly frequencyAggregate: AggregateBindable<number>;
  private readonly tempoAggregate: AggregateBindable<number>;

  constructor() {
    const create = (type: AdjustableProperty) => {
      const aggregate = new AggregateBindable<number>(getAggregateFunction(type), this.getProperty(type).getUnboundCopy());
      aggregate.addSource(this.getProperty(type));
      return aggregate;
    };

    this.volumeAggregate = create(AdjustableProperty.Volume);
    this.balanceAggregate = create(AdjustableProperty.Balance);
    this.frequencyAggregate = create(AdjustableProperty.Frequency);
    this.tempoAggregate = create(AdjustableProperty.Tempo);
  }

  addAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void {
    this.getAggregateBindable(type).addSource(adjustBindable);
  }

  removeAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void {
    this.getAggregateBindable(type).removeSource(adjustBindable);
  }

  bindAdjustments(component: IAggregateAudioAdjustment): void {
    for (const type of all_adjustments)
      this.getAggregateBindable(type).addSource(getAggregate(component, type));
  }

  unbindAdjustments(component: IAggregateAudioAdjustment): void {
    for (const type of all_adjustments)
      this.getAggregateBindable(type).removeSource(getAggregate(component, type));
  }

  removeAllAdjustments(type: AdjustableProperty): void {
    const aggregate = this.getAggregateBindable(type);

    aggregate.removeAllSources();
    aggregate.addSource(this.getProperty(type));
  }

  private getAggregateBindable(type: AdjustableProperty): AggregateBindable<number> {
    switch (type) {
      case AdjustableProperty.Balance:
        return this.balanceAggregate;

      case AdjustableProperty.Frequency:
        return this.frequencyAggregate;

      case AdjustableProperty.Volume:
        return this.volumeAggregate;

      case AdjustableProperty.Tempo:
        return this.tempoAggregate;
    }
  }

  private getProperty(type: AdjustableProperty): BindableDouble {
    switch (type) {
      case AdjustableProperty.Balance:
        return this.balance;

      case AdjustableProperty.Frequency:
        return this.frequency;

      case AdjustableProperty.Volume:
        return this.volume;

      case AdjustableProperty.Tempo:
        return this.tempo;
    }
  }
}

function getAggregateFunction(type: AdjustableProperty): (a: number, b: number) => number {
  switch (type) {
    default:
      return (a, b) => a * b;

    case AdjustableProperty.Balance:
      return (a, b) => a + b;
  }
}

/** An audio component which allows for basic bindable adjustments to be applied. */
export class AdjustableAudioComponent extends AudioComponent implements IAdjustableAudioComponent {
  private _adjustments: AudioAdjustments | null = null;

  /** @internal */
  get adjustments(): AudioAdjustments {
    if (this._adjustments !== null)
      return this._adjustments;

    const adj = new AudioAdjustments();

    const invalidate = () => this.invalidateState();
    adj.aggregateVolume.bindValueChanged(invalidate);
    adj.aggregateBalance.bindValueChanged(invalidate);
    adj.aggregateFrequency.bindValueChanged(invalidate);
    adj.aggregateTempo.bindValueChanged(invalidate);

    return this._adjustments = adj;
  }

  /** The volume of this component. */
  get volume(): BindableDouble { return this.adjustments.volume; }

  /** The playback balance of this sample (-1 .. 1 where 0 is centered) */
  get balance(): BindableDouble { return this.adjustments.balance; }

  /** Rate at which the component is played back (affects pitch). 1 is 100% playback speed, or default frequency. */
  get frequency(): BindableDouble { return this.adjustments.frequency; }

  /** Rate at which the component is played back (does not affect pitch). 1 is 100% playback speed. */
  get tempo(): BindableDouble { return this.adjustments.tempo; }

  addAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void {
    this.adjustments.addAdjustment(type, adjustBindable);
  }

  removeAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void {
    this.adjustments.removeAdjustment(type, adjustBindable);
  }

  removeAllAdjustments(type: AdjustableProperty): void {
    this.adjustments.removeAllAdjustments(type);
  }

  /** @internal */
  invalidateState(): void {
    // CanPerformInline
    this.onStateChanged();
  }

  /** @internal */
  onStateChanged(): void {
  }

  bindAdjustments(component: IAggregateAudioAdjustment): void {
    this.adjustments.bindAdjustments(component);
  }

  unbindAdjustments(component: IAggregateAudioAdjustment): void {
    this._adjustments?.unbindAdjustments(component);
  }

  get aggregateVolume(): Bindable<number> { return this.adjustments.aggregateVolume; }

  get aggregateBalance(): Bindable<number> { return this.adjustments.aggregateBalance; }

  get aggregateFrequency(): Bindable<number> { return this.adjustments.aggregateFrequency; }

  get aggregateTempo(): Bindable<number> { return this.adjustments.aggregateTempo; }

  protected override onDispose(disposing: boolean): void {
    super.onDispose(disposing);

    this.aggregateVolume.unbindAll();
    this.aggregateBalance.unbindAll();
    this.aggregateFrequency.unbindAll();
    this.aggregateTempo.unbindAll();
  }
}
