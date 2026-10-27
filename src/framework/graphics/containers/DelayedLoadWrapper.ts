// Ported from osu.Framework/Graphics/Containers/DelayedLoadWrapper.cs
// The optimising container (IOnScreenOptimisingContainer, implemented by ScrollContainer) is the closest ScrollContainer parent. Loads can't be
// cancelled mid-way (CompositeDrawable.loadComponentAsync has no cancellation): a cancelled load's addition is skipped instead.

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Signal } from '../../bindables/Signal';
import { Axes, Invalidation } from '../../layout/Enums';
import { type InvalidationSource, LayoutValue } from '../../layout/Layout';
import { intersects } from '../../layout/Primitives';
import type { ScheduledDelegate } from '../../timing/Scheduler';
import { Game } from '../../Game';
import type { Drawable } from '../Drawable';
import { CompositeDrawable } from './CompositeDrawable';
import { ScrollContainer } from './ScrollContainer';

export class DelayedLoadWrapper extends CompositeDrawable {
  protected game!: Game;

  private readonly createFunc: (() => Drawable) | null = null;

  constructor(content: Drawable | (() => Drawable), timeBeforeLoad = 500) {
    super();

    this.timeBeforeLoad = timeBeforeLoad;

    this.addLayout(this.optimisingContainerCache);
    this.addLayout(this.isIntersectingCache);

    if (typeof content === 'function')
      this.createFunc = content;
    else
      this.content = content;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.game = dependencies.resolve(Game);

    return r;
  }

  private _content: Drawable | null = null;

  get content(): Drawable | null {
    return this._content;
  }

  protected set content(value: Drawable | null) {
    if (this._content === value)
      return;

    this._content = value;

    if (value === null)
      return;

    this.autoSizeAxes = Axes.None;
    this.relativeSizeAxes = Axes.None;

    this.relativeSizeAxes = value.relativeSizeAxes;
    this.autoSizeAxes = value instanceof CompositeDrawable ? value.autoSizeAxes : this.autoSizeAxes;
  }

  private readonly timeBeforeLoad: number;
  private timeVisible = 0;

  protected get shouldLoadContent(): boolean {
    return this.timeVisible > this.timeBeforeLoad;
  }

  /** (C#'s cancellation token for the load) */
  private loadCancelled: { cancelled: boolean } | null = null;
  private scheduledAddition: ScheduledDelegate | null = null;

  protected override update(): void {
    super.update();

    // This code can be expensive, so only run if we haven't yet loaded.
    if (this.delayedLoadCompleted || this.delayedLoadTriggered) return;

    if (!this.isIntersecting)
      this.timeVisible = 0;
    else
      this.timeVisible += this.time.elapsed;

    if (this.shouldLoadContent)
      this.beginDelayedLoad();
  }

  protected beginDelayedLoad(): void {
    if (this.delayedLoadTriggered || this.delayedLoadCompleted)
      throw new Error('Load has already started!');

    this.content ??= this.createFunc!();

    this.delayedLoadTriggered = true;
    this.delayedLoadStarted.emit(this.content);

    const token = this.loadCancelled = { cancelled: false };

    // The callback is run on the game's scheduler since DelayedLoadUnloadWrapper needs to unload when no updates are being received.
    void this.loadComponentAsync(this.content, c => {
      if (!token.cancelled)
        this.endDelayedLoad(c);
    }, this.game.scheduler);
  }

  protected endDelayedLoad(content: Drawable): void {
    this.timeVisible = 0;

    // This code is running on the game's scheduler, while this wrapper may have been async disposed, so the addition is scheduled locally to prevent adding to disposed wrappers.
    this.scheduledAddition = this.schedule(() => {
      this.addInternal(content);

      this.delayedLoadCompleted = true;
      this.delayedLoadComplete.emit(content);
    });
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);

    this.cancelTasks();
  }

  protected cancelTasks(): void {
    this.isIntersectingCache.invalidate();

    if (this.loadCancelled !== null)
      this.loadCancelled.cancelled = true;
    this.loadCancelled = null;

    this.scheduledAddition?.cancel();
    this.scheduledAddition = null;
  }

  /** Fired when delayed async load has started. */
  readonly delayedLoadStarted = new Signal<Drawable>();

  /** Fired when delayed async load completes. Should be used to perform transitions. */
  readonly delayedLoadComplete = new Signal<Drawable>();

  /** True if the load task for our content has been started. */
  protected delayedLoadTriggered = false;

  /** True if the content has been added to the hierarchy. */
  delayedLoadCompleted = false;

  private readonly optimisingContainerCache = new LayoutValue(Invalidation.Parent);
  private readonly isIntersectingCache = new LayoutValue(Invalidation.All);
  private isIntersectingResetDelegate: ScheduledDelegate | null = null;

  protected isIntersecting = false;

  private optimisingContainer: ScrollContainer | null = null;

  protected override onInvalidate(invalidation: Invalidation, source: InvalidationSource): boolean {
    let result = super.onInvalidate(invalidation, source);

    // For every invalidation, we schedule a reset of IsIntersecting to the game.
    // This is done since UpdateSubTreeMasking() may not be invoked in the current frame, as a result of presence/masking changes anywhere in our super-tree.
    // It is important that this is scheduled such that it occurs on the NEXT frame, in order to give this wrapper a chance to load its contents.
    // For example, if a parent invalidated this wrapper every frame, IsIntersecting would be false by the time Update() is run and may only become true at the very end of the frame.
    // The scheduled delegate will be cancelled if this wrapper has its UpdateSubTreeMasking() invoked, as more accurate intersections can be computed there instead.
    if (this.isIntersectingResetDelegate === null && this.game !== undefined) {
      this.isIntersectingResetDelegate = this.game.scheduler.addDelayed(() => this.isIntersecting = false, 0);
      result = true;
    }

    return result;
  }

  override updateSubTreeMasking(): boolean {
    const result = super.updateSubTreeMasking();

    // We can accurately compute intersections - the scheduled reset is no longer required.
    this.isIntersectingResetDelegate?.cancel();
    this.isIntersectingResetDelegate = null;

    if (!this.isIntersectingCache.isValid) {
      if (!this.optimisingContainerCache.isValid) {
        this.optimisingContainer = this.findClosestParent(ScrollContainer);
        this.optimisingContainerCache.validate();
      }

      // The first condition is an intersection against the hierarchy, including any parents that may be masking this wrapper.
      // It is the same calculation as Drawable.IsMaskedAway, however IsMaskedAway is optimised out for some CompositeDrawables (which this wrapper is).
      // The second condition is an exact intersection against the optimising container, which further optimises rotated AABBs where the wrapper content is not visible.
      this.isIntersecting = this.computeMaskingBounds().intersectsWith(this.screenSpaceDrawQuad.aabbFloat)
        && (this.optimisingContainer === null || intersects(this.optimisingContainer.screenSpaceDrawQuad, this.screenSpaceDrawQuad));

      this.isIntersectingCache.validate();
    }

    return result;
  }
}
