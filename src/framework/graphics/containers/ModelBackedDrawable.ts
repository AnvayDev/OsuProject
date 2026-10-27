// Ported from osu.Framework/Graphics/Containers/ModelBackedDrawable.cs
// The comparer is a function (C#'s IEqualityComparer<T>; the default compares with ===).

import type { TransformSequence } from '../../transforms/TransformSequence';
import { Easing } from '../../transforms/Easing';
import type { Drawable } from '../Drawable';
import { emptyDrawable } from '../EmptyDrawable';
import { CompositeDrawable } from './CompositeDrawable';
import { DelayedLoadWrapper } from './DelayedLoadWrapper';

/** Manages dynamically displaying a custom Drawable based on a model object. Useful for replacing Drawables not managed by the source object. */
export abstract class ModelBackedDrawable<T> extends CompositeDrawable {
  /** The currently displayed Drawable. Null if no drawable is displayed. */
  protected get displayedDrawable(): Drawable | null {
    return this.displayedWrapper?.content ?? null;
  }

  protected readonly comparer: (a: T | null, b: T | null) => boolean;

  private _model: T | null = null;

  /** Gets or sets the model, potentially triggering the current Drawable to update. Subclasses should not expose this property directly. */
  protected get model(): T | null {
    return this._model;
  }

  protected set model(value: T | null) {
    if (this._model == null && value == null)
      return;

    if (this.comparer(this._model, value))
      return;

    this._model = value;

    this.scheduler.addOnce(this.updateDrawable);
  }

  /** The wrapper which has the current displayed content. */
  private displayedWrapper: DelayedLoadWrapper | null = null;

  /** The wrapper which is currently loading, or has finished loading (i.e displayedWrapper). */
  private currentWrapper: DelayedLoadWrapper | null = null;

  protected constructor(comparer: (a: T | null, b: T | null) => boolean = (a, b) => a === b) {
    super();

    this.comparer = comparer;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.scheduler.addOnce(this.updateDrawable);
  }

  private readonly updateDrawable = (): void => {
    if (this.transformImmediately) {
      // If loading to a new model and we've requested to transform immediately, load a null model to allow such transforms to occur
      this.loadModelDrawable(null);
    }

    this.loadModelDrawable(() => this.createDrawable(this._model) ?? emptyDrawable());
  };

  /** (C#'s loadDrawable; renamed: Drawable.loadDrawable is the framework load entry) */
  private loadModelDrawable(createDrawableFunc: (() => Drawable | null) | null): void {
    // Remove the previous wrapper if the inner drawable hasn't finished loading.
    if (this.currentWrapper?.delayedLoadCompleted === false) {
      this.removeInternal(this.currentWrapper, false);
      this.disposeChildAsync(this.currentWrapper);
    }

    this.currentWrapper = createDrawableFunc === null
      ? null
      : this.createWrapper(createDrawableFunc, this.loadDelay);

    if (this.currentWrapper === null) {
      this.onLoadStarted();
      this.finishLoad(this.currentWrapper);
      this.onLoadFinished();
    } else {
      const wrapper = this.currentWrapper;

      this.addInternal(wrapper);
      wrapper.delayedLoadStarted.add(() => this.onLoadStarted());
      wrapper.delayedLoadComplete.add(() => {
        this.finishLoad(wrapper);
        this.onLoadFinished();
      });
    }
  }

  /** Invoked when a DelayedLoadWrapper has finished loading its contents. May be invoked multiple times for each DelayedLoadWrapper. */
  private finishLoad(wrapper: DelayedLoadWrapper | null): void {
    let showTransforms: TransformSequence<Drawable> | null = null;

    if (wrapper !== null) {
      // Make the wrapper initially hidden.
      this.applyHideTransforms(wrapper);
      wrapper.finishTransforms();

      showTransforms = this.applyShowTransforms(wrapper);
    }

    // If the wrapper hasn't changed then this invocation must be a result of a reload (e.g. DelayedLoadUnloadWrapper)
    // In that case, we do not want to apply hide transforms and expire the last wrapper.
    if (this.displayedWrapper !== null && this.displayedWrapper !== wrapper) {
      const lastWrapper = this.displayedWrapper;

      // If the new wrapper is non-null, we need to wait for the show transformation to complete before hiding the old wrapper,
      // otherwise, we can hide the old wrapper instantaneously and leave a blank display
      const hideTransforms = wrapper === null
        ? this.applyHideTransforms(lastWrapper)
        : (lastWrapper as Drawable).delay(this.transformDuration).append(d => this.applyHideTransforms(d));

      // Expire the last wrapper after the front-most transform has completed (the last wrapper is assumed to be invisible by that point)
      (showTransforms ?? hideTransforms).onComplete(() => lastWrapper.expire());
    }

    this.displayedWrapper = wrapper;
  }

  private createWrapper(createContentFunc: () => Drawable | null, timeBeforeLoad: number): DelayedLoadWrapper {
    // Note that this only becomes null after the first consumption.
    // ie. the `createContentFunc` cannot provide a null.
    let content: Drawable | null = createContentFunc();

    return this.createDelayedLoadWrapper(() => {
      try {
        // optimisation to use already constructed object (used above for null check).
        return content ?? createContentFunc()!;
      } finally {
        // consume initial object if not already.
        content = null;
      }
    }, timeBeforeLoad);
  }

  /** Invoked when the Drawable for the current model has started loading. */
  protected onLoadStarted(): void {
  }

  /** Invoked when the Drawable for the current model has finished loading. */
  protected onLoadFinished(): void {
  }

  /** Determines whether hide and show transforms should be applied immediately once the new model is loaded, or after the drawable has loaded. */
  protected get transformImmediately(): boolean {
    return false;
  }

  /** The default time used for the transformations used in applyShowTransforms and applyHideTransforms. */
  protected get transformDuration(): number {
    return 1000;
  }

  /** The delay in milliseconds before Drawables begin loading. */
  protected get loadDelay(): number {
    return 0;
  }

  /** Allows subclasses to customise the DelayedLoadWrapper. */
  protected createDelayedLoadWrapper(createContentFunc: () => Drawable, timeBeforeLoad: number): DelayedLoadWrapper {
    return new DelayedLoadWrapper(createContentFunc(), timeBeforeLoad);
  }

  /** Override to instantiate a custom Drawable based on the passed model. May be null to indicate that the model has no visual representation. */
  protected abstract createDrawable(model: T | null): Drawable | null;

  /** Hides a drawable. */
  protected applyHideTransforms(drawable: Drawable): TransformSequence<Drawable> {
    return drawable.fadeOut(this.transformDuration, Easing.OutQuint);
  }

  /** Shows a drawable. */
  protected applyShowTransforms(drawable: Drawable): TransformSequence<Drawable> {
    return drawable.fadeIn(this.transformDuration, Easing.OutQuint);
  }
}
