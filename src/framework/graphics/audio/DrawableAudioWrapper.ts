// Ported from osu.Framework/Graphics/Audio/DrawableAudioWrapper.cs
// DrawableAudioMixer is not ported, so there is no parent IAudioMixer to look up and OnMixerChanged is omitted (tracks stay on the mixer their
// TrackStore assigned). The [Cached(typeof(IAggregateAudioAdjustment))] attribute is omitted: nothing in the port resolves it.

import { AdjustableProperty, AudioAdjustments, type IAdjustableAudioComponent, type IAggregateAudioAdjustment } from '../../audio/AudioComponent';
import type { Bindable } from '../../bindables/Bindable';
import type { BindableDouble } from '../../bindables/BindableNumber';
import { Invalidation } from '../../layout/Enums';
import { LayoutValue } from '../../layout/Layout';
import { Easing, type IEasingFunction } from '../../transforms/Easing';
import { TransformSequence } from '../../transforms/TransformSequence';
import type { Transformable } from '../../transforms/Transformable';
import { CompositeDrawable } from '../containers/CompositeDrawable';
import type { Drawable } from '../Drawable';

const isAggregateAudioAdjustment = (d: Drawable): d is Drawable & IAggregateAudioAdjustment =>
  (d as Partial<IAggregateAudioAdjustment>).aggregateVolume !== undefined;

/** A wrapper which allows audio components (or adjustments) to exist in the draw hierarchy. */
export abstract class DrawableAudioWrapper extends CompositeDrawable implements IAdjustableAudioComponent {
  /** The volume of this component. */
  get volume(): BindableDouble { return this.adjustments.volume; }

  /** The playback balance of this sample (-1 .. 1 where 0 is centered) */
  get balance(): BindableDouble { return this.adjustments.balance; }

  /** Rate at which the component is played back (affects pitch). 1 is 100% playback speed, or default frequency. */
  get frequency(): BindableDouble { return this.adjustments.frequency; }

  /** Rate at which the component is played back (does not affect pitch). 1 is 100% playback speed. */
  get tempo(): BindableDouble { return this.adjustments.tempo; }

  bindAdjustments(component: IAggregateAudioAdjustment): void {
    this.adjustments.bindAdjustments(component);
  }

  unbindAdjustments(component: IAggregateAudioAdjustment): void {
    this.adjustments.unbindAdjustments(component);
  }

  private readonly component: IAdjustableAudioComponent | null = null;
  private readonly disposeUnderlyingComponentOnDispose: boolean = false;

  private readonly adjustments = new AudioAdjustments();

  private parentAdjustment: IAggregateAudioAdjustment | null = null;

  private readonly fromParentLayout = new LayoutValue(Invalidation.Parent);

  /**
   * Creates a container which applies adjustments to an underlying component (C#'s IAdjustableAudioComponent constructor),
   * or one which only applies adjustments to its content (C#'s Drawable constructor).
   */
  protected constructor(content: Drawable | IAdjustableAudioComponent, disposeUnderlyingComponentOnDispose = true) {
    super();

    this.addLayout(this.fromParentLayout);

    if (isAdjustableComponent(content)) {
      this.component = content;
      this.disposeUnderlyingComponentOnDispose = disposeUnderlyingComponentOnDispose;

      content.bindAdjustments(this.adjustments);
    } else
      this.addInternal(content);
  }

  protected override update(): void {
    super.update();

    if (!this.fromParentLayout.isValid) {
      this.refreshLayoutFromParent();
      this.fromParentLayout.validate();
    }
  }

  private refreshLayoutFromParent(): void {
    // because these components may be pooled, relying on DI is not feasible.
    // in the majority of cases the traversal should be quite short. may require later attention if a use case comes up which this is not true for.
    let cursor: Drawable | null = this;
    let newAdjustments: IAggregateAudioAdjustment | null = null;

    const hasParent = this.parent !== null;

    while ((cursor = cursor.parent) !== null) {
      if (isAggregateAudioAdjustment(cursor)) {
        // components may be delegating the aggregates of a contained child.
        // to avoid binding to one's self, check reference equality on an arbitrary bindable.
        if (cursor.aggregateVolume !== this.adjustments.aggregateVolume) {
          newAdjustments = cursor;
          break;
        }
      }
    }

    if (newAdjustments !== this.parentAdjustment) {
      if (this.parentAdjustment !== null) this.adjustments.unbindAdjustments(this.parentAdjustment);
      this.parentAdjustment = newAdjustments;
      if (this.parentAdjustment !== null) this.adjustments.bindAdjustments(this.parentAdjustment);
    }

    if (!hasParent)
      this.onParentLost();
  }

  /** @internal */
  protected onParentLost(): void {
  }

  /** @internal */
  override unbindAllBindables(): void {
    super.unbindAllBindables();

    if (!this.disposeUnderlyingComponentOnDispose)
      this.component?.unbindAdjustments(this.adjustments);

    // Running this as early as we can seems beneficial for the case a mixer is present.
    this.refreshLayoutFromParent();
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);

    if (this.disposeUnderlyingComponentOnDispose)
      (this.component as { dispose?(): void } | null)?.dispose?.();

    this.parentAdjustment = null;
  }

  addAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void {
    this.adjustments.addAdjustment(type, adjustBindable);
  }

  removeAdjustment(type: AdjustableProperty, adjustBindable: Bindable<number>): void {
    this.adjustments.removeAdjustment(type, adjustBindable);
  }

  removeAllAdjustments(type: AdjustableProperty): void {
    this.adjustments.removeAllAdjustments(type);
  }

  get aggregateVolume(): Bindable<number> { return this.adjustments.aggregateVolume; }

  get aggregateBalance(): Bindable<number> { return this.adjustments.aggregateBalance; }

  get aggregateFrequency(): Bindable<number> { return this.adjustments.aggregateFrequency; }

  get aggregateTempo(): Bindable<number> { return this.adjustments.aggregateTempo; }

  // AudioTransformExtensions (osu.Framework/Audio/IAdjustableAudioComponent.cs)

  /** Smoothly adjusts Volume over time. */
  volumeTo(newVolume: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformBindableTo(this.volume, newVolume, duration, easing);
  }

  /** Smoothly adjusts Balance over time. */
  balanceTo(newBalance: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformBindableTo(this.balance, newBalance, duration, easing);
  }

  /** Smoothly adjusts Frequency over time. */
  frequencyTo(newFrequency: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformBindableTo(this.frequency, newFrequency, duration, easing);
  }

  /** Smoothly adjusts Tempo over time. */
  tempoTo(newTempo: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformBindableTo(this.tempo, newTempo, duration, easing);
  }
}

function isAdjustableComponent(c: Drawable | IAdjustableAudioComponent): c is IAdjustableAudioComponent {
  return typeof (c as Partial<IAdjustableAudioComponent>).bindAdjustments === 'function';
}

// AudioTransformExtensions on TransformSequence: each appends the helper of the same name.
type EasingArg = Easing | IEasingFunction;

declare module '../../transforms/TransformSequence' {
  interface TransformSequence<T extends Transformable> {
    volumeTo(newVolume: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    balanceTo(newBalance: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    frequencyTo(newFrequency: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    tempoTo(newTempo: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
  }
}

for (const name of ['volumeTo', 'balanceTo', 'frequencyTo', 'tempoTo'] as const) {
  Object.defineProperty(TransformSequence.prototype, name, {
    configurable: true,
    writable: true,
    value(this: TransformSequence<DrawableAudioWrapper>, ...args: [number, number?, EasingArg?]) {
      return this.append(o => o[name](...args));
    },
  });
}
