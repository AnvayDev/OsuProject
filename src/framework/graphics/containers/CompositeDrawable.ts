// Ported from osu.Framework/Graphics/Containers/CompositeDrawable.cs (+ CompositeDrawable.DrawNode.cs for masking/border/edge effect).
//
// DOM: children's elements live in `childElementContainer`, kept in internalChildren order. Non-drawn children are display:none.
// With Masking, the composite element contains [edgeEffectElement, maskElement (overflow hidden, border-radius) -> children..., borderElement].

import { DependencyContainer, type IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Axes, Invalidation, LoadState } from '../../layout/Enums';
import { InvalidationSource, LayoutValue, LayoutValueOf } from '../../layout/Layout';
import { MarginPadding } from '../../layout/MarginPadding';
import { Precision, RectangleF } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import { SortedList } from '../../lists/SortedList';
import type { IFrameBasedClock } from '../../timing/IClock';
import { Scheduler, type ScheduledDelegate } from '../../timing/Scheduler';
import { Easing } from '../../transforms/Easing';
import { TransformCustom } from '../../transforms/TransformCustom';
import type { TransformSequence } from '../../transforms/TransformSequence';
import { AbsoluteSequenceSender } from '../../transforms/Transformable';
import { InvokeOnDisposal } from '../../allocation/InvokeOnDisposal';
import { Colour4 } from '../Colour4';
import { ColourInfo } from '../ColourInfo';
import { EdgeEffectParameters, EdgeEffectType } from '../DrawInfo';
import { edgeEffectCss } from './EdgeEffectStyle';
import { Drawable } from '../Drawable';
// Registers Drawable.proxyFactory (ProxyDrawable extends Drawable, so Drawable.ts cannot import it).
import '../ProxyDrawable';

enum ChildLifeStateChange {
  None = 0,
  MadeAlive = 1,
  MadeDead = 1 << 1,
  Removed = 1 << 2,
}

const amount_children_required_for_masking_check = 2;

/** A drawable consisting of a composite of child drawables which are manipulated by the composite's derived class. */
export abstract class CompositeDrawable extends Drawable {
  // #region Construction and disposal

  constructor() {
    super();

    const childComparer = (x: Drawable, y: Drawable) => this.compare(x, y);
    this.internalChildrenList = new SortedList<Drawable>(childComparer);
    this.aliveInternalChildrenList = new SortedList<Drawable>(childComparer);

    // Validate initially. Done before the layout is added below to prevent a callback to this composite.
    this.childrenSizeDependencies.validate();

    this.addLayout(this.childrenSizeDependencies);
    this.addLayout(this.childMaskingBoundsBacking);
  }

  /** Create a local dependency container which will be used by our nested children. Override to cache dependencies ([Cached]). */
  protected createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    return parent;
  }

  /** Contains all dependencies that can be injected into this CompositeDrawable's children using [Resolved]. */
  dependencies: IReadOnlyDependencyContainer | null = null;

  private pendingChildLoads: Promise<void>[] = [];

  protected override injectDependencies(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    // get our dependencies from our parent, but allow local overriding of our inherited dependency container
    this.dependencies = this.createChildDependencies(dependencies);

    const result = super.injectDependencies(dependencies);

    // Children loaded during our load chain may load asynchronously (e.g. textures); we are only ready once they are.
    const pending = this.pendingChildLoads;
    this.pendingChildLoads = [];

    if (result instanceof Promise || pending.length > 0)
      return Promise.all([result, ...pending]).then(() => undefined);
  }

  /** Loads a future child or grand-child of this CompositeDrawable asynchronously. onLoaded runs on our scheduler (next frame at the earliest). */
  loadComponentAsync<T extends Drawable>(component: T, onLoaded: ((loaded: T) => void) | null = null, scheduler: Scheduler | null = null): Promise<T> {
    return this.loadComponentsAsync([component], l => onLoaded?.(l[0]), scheduler).then(l => l[0]);
  }

  /** Loads several future children asynchronously. */
  loadComponentsAsync<T extends Drawable>(components: T[], onLoaded: ((loaded: T[]) => void) | null = null, scheduler: Scheduler | null = null): Promise<T[]> {
    if (this.loadState < LoadState.Loading)
      throw new Error('May not invoke LoadComponentAsync prior to this CompositeDrawable being loaded.');

    if (this.isDisposed)
      throw new Error(`Cannot load components into disposed ${this}.`);

    const deps = new DependencyContainer(this.dependencies);

    return new Promise<T[]>((resolve, reject) => {
      // Emulates the background load thread: never run inline with the caller.
      queueMicrotask(() => {
        const loads: Promise<void>[] = [];
        const loadables = components.filter(c => {
          if (c.isDisposed || this.isDisposed) return false;
          const r = c.loadDrawable(this.clock, deps);
          if (r instanceof Promise) loads.push(r);
          return true;
        });

        Promise.all(loads).then(() => {
          if (loadables.length === 0 || this.isDisposed)
            return;

          (scheduler ?? this.scheduler).add(() => {
            onLoaded?.(loadables);
            resolve(loadables);
          });
        }, reject);
      });
    });
  }

  /** Loads a future child or grand-child of this CompositeDrawable synchronously and immediately. */
  protected loadComponent<T extends Drawable>(component: T): void {
    if (this.loadState < LoadState.Loading)
      throw new Error('May not invoke LoadComponent prior to this CompositeDrawable being loaded.');

    const r = component.loadDrawable(this.clock, this.dependencies!);
    if (r instanceof Promise) this.trackChildLoad(r);
  }

  /** The [BackgroundDependencyLoader] of CompositeDrawable: aggressively loads all children regardless of their alive state. */
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    // We are in a potentially async context, so let's aggressively load all our children
    // regardless of their alive state. this also gives children a clock so they can be checked
    // for their correct alive state in the case LifetimeStart is set to a definite value.
    for (const c of this.internalChildrenList.toArray())
      this.loadChild(c);

    return r;
  }

  protected override loadAsyncComplete(): void {
    super.loadAsyncComplete();

    // At this point we can assume that we are loaded although we're not in the "ready" state, because we'll be given
    // a "ready" state soon after this method terminates. Therefore we can perform an early check to add any alive children
    // while we're still in an asynchronous context and avoid putting pressure on the main thread during UpdateSubTree.
    this.checkChildrenLife();
  }

  private trackChildLoad(p: Promise<void>): void {
    if (this.loadState === LoadState.Loading)
      this.pendingChildLoads.push(p);
  }

  private loadChild(child: Drawable): void {
    if (this.isDisposed)
      return;

    const r = child.loadDrawable(this.clock, this.dependencies!);

    if (r instanceof Promise) {
      this.trackChildLoad(r);
      r.then(() => {
        // the child may have been removed while loading.
        if (!this.isDisposed && child.parent === null && this.internalChildrenList.toArray().includes(child))
          child.parent = this;
      });
      return;
    }

    child.parent = this;
  }

  protected override disposeInternal(isDisposing: boolean): void {
    if (this.isDisposed)
      return;

    for (const c of [...this.internalChildrenList.toArray()])
      c.dispose();

    this.onAutoSize = null;
    this.dependencies = null;
    this._schedulerAfterChildren = null;

    super.disposeInternal(isDisposing);
  }

  // #endregion

  // #region Children management

  /** @internal */ childBecameAlive: ((d: Drawable) => void) | null = null;
  /** @internal */ childDied: ((d: Drawable) => void) | null = null;
  /** @internal */ childDepthChanged: ((d: Drawable) => void) | null = null;

  /** Gets or sets the only child in internalChildren. */
  protected get internalChild(): Drawable {
    if (this.internalChildren.length !== 1)
      throw new Error(`Cannot call InternalChild unless there's exactly one Drawable in InternalChildren (currently ${this.internalChildren.length})!`);

    return this.internalChildren[0];
  }

  protected set internalChild(value: Drawable) {
    if (this.isDisposed)
      return;

    this.clearInternal();
    this.addInternal(value);
  }

  /** Compares two internalChildren to determine their sorting: higher depth first, then by ChildID. */
  protected compare(x: Drawable, y: Drawable): number {
    const i = y.depth - x.depth;
    if (i !== 0) return i < 0 ? -1 : 1;

    return x.childID - y.childID;
  }

  /** Helper method comparing children by their depth first, and then by their reversed child ID. */
  protected compareReverseChildID(x: Drawable, y: Drawable): number {
    const i = y.depth - x.depth;
    if (i !== 0) return i < 0 ? -1 : 1;

    return y.childID - x.childID;
  }

  private readonly internalChildrenList: SortedList<Drawable>;

  /** This CompositeDrawable's list of children. */
  get internalChildren(): readonly Drawable[] {
    return this.internalChildrenList.toArray();
  }

  set internalChildren(value: readonly Drawable[]) {
    if (this.isDisposed)
      return;

    this.clearInternal();
    this.addRangeInternal(value);
  }

  private readonly aliveInternalChildrenList: SortedList<Drawable>;

  /** All children which are alive. */
  get aliveInternalChildren(): readonly Drawable[] {
    return this.aliveInternalChildrenList.toArray();
  }

  /** Gets the index of a drawable in internalChildren, or a negative value if not contained. */
  protected indexOfInternal(drawable: Drawable): number {
    if (drawable.parent !== null && drawable.parent !== this)
      throw new Error('Cannot call IndexOfInternal for a drawable that already is a child of a different parent.');

    const index = this.internalChildrenList.indexOf(drawable);

    if (index >= 0 && this.internalChildrenList.get(index).childID !== drawable.childID)
      throw new Error(`A non-matching Drawable was returned. Please ensure ${this.constructor.name}'s Compare override implements a stable sort algorithm.`);

    return index;
  }

  /** Checks whether a given child is contained within internalChildren. */
  protected containsInternal(drawable: Drawable): boolean {
    return this.indexOfInternal(drawable) >= 0;
  }

  /** Removes a given child from this container. Returns false if not contained. */
  protected removeInternal(drawable: Drawable, disposeImmediately: boolean): boolean {
    try {
      const index = this.indexOfInternal(drawable);
      if (index < 0)
        return false;

      this.internalChildrenList.removeAt(index);
      drawable.element.remove();

      if (drawable.isAlive) {
        this.aliveInternalChildrenList.remove(drawable);
        this.childDied?.(drawable);
      }

      if (drawable.loadState >= LoadState.Ready && drawable.parent !== this)
        throw new Error(`Removed a drawable (${drawable}) whose parent was not this (${this}), but ${drawable.parent}.`);

      drawable.parent = null;
      drawable.isAlive = false;

      if (this.autoSizeAxes !== Axes.None)
        this.invalidate(Invalidation.RequiredParentSizeToFit, InvalidationSource.Child);

      return true;
    } finally {
      if (disposeImmediately)
        drawable?.dispose();
    }
  }

  /** Clear all of internalChildren. */
  protected clearInternal(disposeChildren = true): void {
    if (this.isDisposed)
      return;

    if (this.internalChildrenList.count === 0) return;

    for (const t of [...this.internalChildrenList.toArray()]) {
      if (t.isAlive)
        this.childDied?.(t);

      t.isAlive = false;
      t.parent = null;
      t.element.remove();

      if (disposeChildren)
        this.disposeChildAsync(t);
    }

    this.internalChildrenList.removeAll(() => true);
    this.aliveInternalChildrenList.removeAll(() => true);

    this.requestsNonPositionalInputSubTree = this.requestsNonPositionalInput;
    this.requestsPositionalInputSubTree = this.requestsPositionalInput;

    if (this.autoSizeAxes !== Axes.None)
      this.invalidate(Invalidation.RequiredParentSizeToFit, InvalidationSource.Child);
  }

  private currentChildID = 0;

  /** Adds a child to internalChildren. */
  protected addInternal(drawable: Drawable): void {
    if (this.isDisposed)
      return;

    if (drawable == null)
      throw new Error('null Drawables may not be added to CompositeDrawable.');

    if (drawable === (this as Drawable))
      throw new Error('CompositeDrawable may not be added to itself.');

    // If the drawable's ChildId is not zero, then it was added to another parent even if it wasn't loaded
    if (drawable.childID !== 0)
      throw new Error('May not add a drawable to multiple containers.');

    drawable.childID = ++this.currentChildID;
    drawable.removeCompletedTransforms = this.removeCompletedTransforms;

    if (this.loadState >= LoadState.Loading) {
      // If we're already loaded, we can eagerly allow children to be loaded
      if (drawable.loadState >= LoadState.Ready)
        drawable.parent = this;
      else
        this.loadChild(drawable);
    }

    const index = this.internalChildrenList.add(drawable);
    this.insertChildElement(drawable, index);

    if (this.autoSizeAxes !== Axes.None)
      this.invalidate(Invalidation.RequiredParentSizeToFit, InvalidationSource.Child);
  }

  /** Adds a range of children to internalChildren. */
  protected addRangeInternal(range: Iterable<Drawable>): void {
    for (const d of range)
      this.addInternal(d);
  }

  /** Changes the depth of an internal child. This affects ordering of internalChildren. */
  protected changeInternalChildDepth(child: Drawable, newDepth: number): void {
    if (child.depth === newDepth) return;

    const index = this.indexOfInternal(child);
    if (index < 0)
      throw new Error('Can not change depth of drawable which is not contained within this CompositeDrawable.');

    this.internalChildrenList.removeAt(index);
    const aliveIndex = this.aliveInternalChildrenList.indexOf(child);
    if (aliveIndex >= 0) // remove if found
      this.aliveInternalChildrenList.removeAt(aliveIndex);

    const chId = child.childID;
    child.childID = 0; // ensure Depth-change does not throw an exception
    child.depth = newDepth;
    child.childID = chId;

    const newIndex = this.internalChildrenList.add(child);
    this.insertChildElement(child, newIndex);

    if (aliveIndex >= 0) // re-add if it used to be in aliveInternalChildren
      this.aliveInternalChildrenList.add(child);

    this.childDepthChanged?.(child);
  }

  /** Sorts all children of this CompositeDrawable (needed when compare() changes its result). */
  protected sortInternal(): void {
    const all = [...this.internalChildrenList.toArray()];
    const alive = [...this.aliveInternalChildrenList.toArray()];

    this.internalChildrenList.removeAll(() => true);
    this.aliveInternalChildrenList.removeAll(() => true);

    for (const c of all) this.internalChildrenList.add(c);
    for (const c of alive) this.aliveInternalChildrenList.add(c);

    for (let i = 0; i < this.internalChildrenList.count; i++)
      this.insertChildElement(this.internalChildrenList.get(i), i);
  }

  /** Keeps DOM order equal to internalChildren order (draw order). */
  private insertChildElement(drawable: Drawable, index: number): void {
    // Proxied drawables' elements live in their proxy's element.
    if (drawable.hasProxy)
      return;

    const next = index + 1 < this.internalChildrenList.count ? this.internalChildrenList.get(index + 1).element : this.borderElement;
    const container = this.childElementContainer;

    if (drawable.element.parentNode === container && drawable.element.nextSibling === next)
      return;

    container.insertBefore(drawable.element, next !== null && next.parentNode === container ? next : null);
  }

  // #endregion

  // #region Updating (per-frame periodic)

  private _schedulerAfterChildren: Scheduler | null = null;

  /** A lazily-initialized scheduler used to schedule tasks to be invoked in future updateAfterChildren calls. */
  protected get schedulerAfterChildren(): Scheduler {
    return this._schedulerAfterChildren ??= new Scheduler(this.clock);
  }

  /** Updates the life status of internalChildren according to their shouldBeAlive property. Returns true if any child's alive state changed. */
  protected updateChildrenLife(): boolean {
    // Can not have alive children if we are not loaded.
    if (this.loadState < LoadState.Ready)
      return false;

    if (!this.checkChildrenLife())
      return false;

    return true;
  }

  /** Checks whether the alive state of any child has changed and processes it. */
  protected checkChildrenLife(): boolean {
    let anyAliveChanged = false;

    for (let i = 0; i < this.internalChildrenList.count; i++) {
      const state = this.checkChildLife(this.internalChildrenList.get(i));

      anyAliveChanged ||= (state & ChildLifeStateChange.MadeAlive) !== 0 || (state & ChildLifeStateChange.MadeDead) !== 0;

      if ((state & ChildLifeStateChange.Removed) !== 0)
        i--;
    }

    return anyAliveChanged;
  }

  private checkChildLife(child: Drawable): ChildLifeStateChange {
    let state = ChildLifeStateChange.None;

    if (child.shouldBeAlive) {
      if (!child.isAlive) {
        if (child.loadState < LoadState.Ready) {
          // If we're already loaded, we can eagerly allow children to be loaded
          this.loadChild(child);
          if (child.loadState < LoadState.Ready)
            return ChildLifeStateChange.None;
        }

        this.makeChildAlive(child);
        state = ChildLifeStateChange.MadeAlive;
      }
    } else {
      if (child.isAlive || child.removeWhenNotAlive) {
        if (this.makeChildDead(child))
          state |= ChildLifeStateChange.Removed;

        state |= ChildLifeStateChange.MadeDead;
      }
    }

    return state;
  }

  /** Makes a child alive. */
  protected makeChildAlive(child: Drawable): void {
    // If the new child has the flag set, we should propagate the flag towards the root.
    // We can stop at the ancestor which has the flag already set because further ancestors will also have the flag set.
    if (child.requestsNonPositionalInputSubTree) {
      for (let ancestor: CompositeDrawable | null = this; ancestor !== null && !ancestor.requestsNonPositionalInputSubTree; ancestor = ancestor.parent)
        ancestor.requestsNonPositionalInputSubTree = true;
    }

    if (child.requestsPositionalInputSubTree) {
      for (let ancestor: CompositeDrawable | null = this; ancestor !== null && !ancestor.requestsPositionalInputSubTree; ancestor = ancestor.parent)
        ancestor.requestsPositionalInputSubTree = true;
    }

    this.aliveInternalChildrenList.add(child);
    child.isAlive = true;

    this.childBecameAlive?.(child);

    // Layout invalidations on non-alive children are blocked, so they must be invalidated once when they become alive.
    child.invalidate(Invalidation.Layout, InvalidationSource.Parent);

    // Notify ourselves that a child has become alive.
    this.invalidate(Invalidation.Presence, InvalidationSource.Child);
  }

  /** Makes a child dead (not alive) and removes it if child.removeWhenNotAlive. Returns whether the child was removed. */
  protected makeChildDead(child: Drawable): boolean {
    if (child.isAlive) {
      this.aliveInternalChildrenList.remove(child);
      child.isAlive = false;

      this.childDied?.(child);
    }

    let removed = false;

    if (child.removeWhenNotAlive) {
      this.removeInternal(child, false);

      if (child.disposeOnDeathRemoval)
        this.disposeChildAsync(child);

      removed = true;
    }

    // Notify ourselves that a child has died.
    this.invalidate(Invalidation.Presence, InvalidationSource.Child);

    return removed;
  }

  override unbindAllBindablesSubTree(): void {
    super.unbindAllBindablesSubTree();

    for (let i = 0; i < this.internalChildrenList.count; i++)
      this.internalChildrenList.get(i).unbindAllBindablesSubTree();
  }

  /** @internal Unbinds a child's bindings synchronously and queues an asynchronous disposal of the child. */
  disposeChildAsync(drawable: Drawable): void {
    drawable.unbindAllBindablesSubTree();
    queueMicrotask(() => drawable.dispose());
  }

  override updateClock(clock: IFrameBasedClock | null): void {
    if (this.clock === clock)
      return;

    super.updateClock(clock);

    for (const child of this.internalChildrenList.toArray())
      child.updateClock(this.clock);

    if (this.clock !== null)
      this._schedulerAfterChildren?.updateClock(this.clock);
  }

  /** Specifies whether this CompositeDrawable requires an update of its children. If the body of this property only returns false, consider using Container.CanBeFlattened instead. */
  protected get requiresChildrenUpdate(): boolean {
    return !this.isMaskedAway || !this.childrenSizeDependencies.isValid;
  }

  override updateSubTree(): boolean {
    if (!super.updateSubTree()) return false;

    // We update our children's life even if we are invisible.
    // Note, that this does not propagate down and may need
    // generalization in the future.
    this.updateChildrenLife();

    // If we are not present then there is never a reason to check
    // for children, as they should never affect our present status.
    if (!this.isPresent || !this.requiresChildrenUpdate) return false;

    this.updateAfterChildrenLife();

    for (let i = 0; i < this.aliveInternalChildrenList.count; ++i)
      this.aliveInternalChildrenList.get(i).updateSubTree();

    this._schedulerAfterChildren?.update();

    this.updateAfterChildren();

    this.updateChildrenSizeDependencies();
    this.updateAfterAutoSize();
    return true;
  }

  override updateSubTreeMasking(): boolean {
    if (!super.updateSubTreeMasking())
      return false;

    if (this.isMaskedAway)
      return true;

    if (this.aliveInternalChildrenList.count === 0)
      return true;

    if (this.requiresChildrenUpdate) {
      for (let i = 0; i < this.aliveInternalChildrenList.count; i++)
        this.aliveInternalChildrenList.get(i).updateSubTreeMasking();
    }

    return true;
  }

  protected override computeIsMaskedAway(maskingBounds: RectangleF): boolean {
    if (!this.canBeFlattened)
      return super.computeIsMaskedAway(maskingBounds);

    // The masking check is overly expensive (requires creation of ScreenSpaceDrawQuad)
    // when only few children exist.
    return this.aliveInternalChildrenList.count >= amount_children_required_for_masking_check && super.computeIsMaskedAway(maskingBounds);
  }

  /** Computes the RectangleF to be used as the masking bounds for all children. */
  protected computeChildMaskingBounds(): RectangleF {
    return this.masking ? RectangleF.intersect(this.computeMaskingBounds(), this.screenSpaceDrawQuad.aabbFloat) : this.computeMaskingBounds();
  }

  private readonly childMaskingBoundsBacking = new LayoutValueOf<RectangleF>(Invalidation.DrawInfo | Invalidation.RequiredParentSizeToFit | Invalidation.Presence);

  /** The screen-space masking bounds for this CompositeDrawable's children. */
  get childMaskingBounds(): RectangleF {
    return this.childMaskingBoundsBacking.isValid ? this.childMaskingBoundsBacking.value : (this.childMaskingBoundsBacking.value = this.computeChildMaskingBounds());
  }

  /** An opportunity to update state once-per-frame after updateChildrenLife has been called, but before any children are updated. */
  protected updateAfterChildrenLife(): void {}

  /** An opportunity to update state once-per-frame after update has been called for all internalChildren. */
  protected updateAfterChildren(): void {}

  /** Invoked after the auto-size has been applied (after updateAfterChildren). */
  protected updateAfterAutoSize(): void {}

  // #endregion

  // #region Invalidation

  protected override onInvalidate(invalidation: Invalidation, source: InvalidationSource): boolean {
    let anyInvalidated = super.onInvalidate(invalidation, source);

    // Child invalidations should not propagate to other children.
    if (source === InvalidationSource.Child)
      return anyInvalidated;

    // DrawNode invalidations should not propagate to children.
    invalidation &= ~Invalidation.DrawNode;
    if (invalidation === Invalidation.None)
      return anyInvalidated;

    let targetChildren = this.aliveInternalChildrenList;

    // Non-layout flags must be propagated to all children. As such, it is simplest + quickest to propagate all other relevant flags along with them.
    if ((invalidation & ~Invalidation.Layout) > 0)
      targetChildren = this.internalChildrenList;

    for (let i = 0; i < targetChildren.count; ++i) {
      const c = targetChildren.get(i);

      let childInvalidation = invalidation;
      if ((invalidation & Invalidation.RequiredParentSizeToFit) > 0)
        childInvalidation |= Invalidation.DrawInfo;

      // Other geometry things like rotation, shearing, etc don't affect child properties.
      childInvalidation &= ~Invalidation.MiscGeometry;

      // Relative positioning can however affect child geometry.
      if (c.relativePositionAxes !== Axes.None && (invalidation & Invalidation.DrawSize) > 0)
        childInvalidation |= Invalidation.MiscGeometry;

      // No draw size changes if relative size axes does not propagate it downward.
      if (c.relativeSizeAxes === Axes.None)
        childInvalidation &= ~Invalidation.DrawSize;

      anyInvalidated = c.invalidate(childInvalidation, InvalidationSource.Parent) || anyInvalidated;
    }

    return anyInvalidated;
  }

  /** @internal Invalidates the children size dependencies of this CompositeDrawable when a child's position or size changes. */
  invalidateChildrenSizeDependencies(invalidation: Invalidation, axes: Axes, source: Drawable): void {
    // Store the current state of the children size dependencies.
    // This state may be restored later if the invalidation proved to be unnecessary.
    const wasValid = this.childrenSizeDependencies.isValid;

    // The invalidation still needs to occur as normal, since a derived CompositeDrawable may want to respond to children size invalidations.
    this.invalidate(invalidation, InvalidationSource.Child);

    // Skip axes that are bypassed.
    axes &= ~source.bypassAutoSizeAxes;

    // Include only axes that this composite is autosizing for.
    axes &= this.autoSizeAxes;

    // If no remaining axes remain, then children size dependencies can immediately be re-validated as the auto-sized size would not change.
    if (wasValid && axes === Axes.None)
      this.childrenSizeDependencies.validate();
  }

  // #endregion

  // #region DrawNode (DOM)

  /** Whether this CompositeDrawable can be flattened into its parent's draw node (affects the masking-away check, as in osu!). */
  protected get canBeFlattened(): boolean {
    // Masking composite draw nodes define the masking area for their children.
    return !this.masking
      // Proxied drawables have their DrawNodes drawn elsewhere in the scene graph.
      && !this.hasProxy;
  }

  /** @internal Walks the drawn subtree (as addFromComposite does) and re-applies element state where invalidated. */
  validateElementSubTree(): void {
    const isRoot = CompositeDrawable.elementValidationDepth++ === 0;
    if (isRoot)
      Drawable.elementFrame++;

    try {
      this.validateElement();

      const children = this.internalChildrenList;

      for (let i = 0; i < children.count; ++i) {
        const drawable = children.get(i);

        const drawn = drawable.isAlive && drawable.isLoaded && (drawable.isProxy || (drawable.isPresent && !drawable.isMaskedAway));

        // Proxied drawables have their elements drawn (shown and positioned) by their proxy, if validated here this frame.
        if (drawable.hasProxy) {
          if (drawn) {
            this.validateChildElement(drawable);
            drawable.validateProxyDrawNode();
          }

          continue;
        }

        const display = drawn ? '' : 'none';
        if (drawable.element.style.display !== display)
          drawable.element.style.display = display;

        if (drawn)
          this.validateChildElement(drawable);
      }
    } finally {
      CompositeDrawable.elementValidationDepth--;
    }

    if (isRoot)
      Drawable.flushProxies?.();
  }

  private validateChildElement(drawable: Drawable): void {
    if (drawable instanceof CompositeDrawable)
      drawable.validateElementSubTree();
    else
      drawable.validateElement();
  }

  private static elementValidationDepth = 0;

  /** Where children's elements are inserted: the mask element when masking, else our own element. */
  protected get childElementContainer(): HTMLElement {
    return this.maskElement ?? this.element;
  }

  private maskElement: HTMLElement | null = null;
  private borderElement: HTMLElement | null = null;
  private edgeEffectElement: HTMLElement | null = null;

  private ensureMaskElement(): HTMLElement {
    if (this.maskElement !== null)
      return this.maskElement;

    const mask = document.createElement('div');
    mask.style.position = 'absolute';
    mask.style.left = '0';
    mask.style.top = '0';
    mask.style.width = '100%';
    mask.style.height = '100%';
    mask.style.overflow = 'hidden';
    mask.style.pointerEvents = 'none';

    // move existing children into the mask.
    for (const c of this.internalChildrenList.toArray()) {
      if (!c.hasProxy)
        mask.appendChild(c.element);
    }

    this.element.appendChild(mask);
    this.maskElement = mask;

    return mask;
  }

  protected override applyElementState(): void {
    super.applyElementState();

    if (!this.masking) {
      if (this.borderThickness !== 0 || this.edgeEffect.type !== EdgeEffectType.None)
        throw new Error('Can not have border effects/edge effects if masking is disabled.');

      if (this.maskElement !== null) {
        this.maskElement.style.overflow = '';
        this.maskElement.style.borderRadius = '';
      }

      return;
    }

    const mask = this.ensureMaskElement();
    const radius = this.effectiveCornerRadius;

    mask.style.overflow = 'hidden';
    mask.style.borderRadius = radius > 0 ? `${radius}px` : '';

    const drawColour = this.drawColourInfo.colour;

    // Border: drawn by the masking shader on top of the children, inside the masking rectangle.
    if (this.borderThickness > 0) {
      if (this.borderElement === null) {
        const b = document.createElement('div');
        b.style.position = 'absolute';
        b.style.inset = '0';
        b.style.boxSizing = 'border-box';
        b.style.pointerEvents = 'none';
        mask.appendChild(b);
        this.borderElement = b;
      }

      const borderColour = ColourInfo.multiply(this.borderColour, drawColour);
      const b = this.borderElement;

      if (borderColour.hasSingleColour) {
        b.style.border = `${this.borderThickness}px solid ${borderColour.topLeft.toCss()}`;
        b.style.padding = b.style.background = b.style.mask = '';
      } else {
        // A gradient border: the gradient fills the border box and a mask cuts out the content box (the shader interpolates the border
        // colour over the masking rectangle the same way). Vertical and horizontal gradients are exact; other gradients use the
        // vertical blend of the averaged edges.
        const vertical = borderColour.topLeft.equals(borderColour.topRight) && borderColour.bottomLeft.equals(borderColour.bottomRight);
        const horizontal = borderColour.topLeft.equals(borderColour.bottomLeft) && borderColour.topRight.equals(borderColour.bottomRight);
        const gradient = horizontal && !vertical
          ? `linear-gradient(to right, ${borderColour.topLeft.toCss()}, ${borderColour.topRight.toCss()})`
          : `linear-gradient(to bottom, ${midColour(borderColour.topLeft, borderColour.topRight).toCss()}, ${midColour(borderColour.bottomLeft, borderColour.bottomRight).toCss()})`;

        b.style.border = '';
        b.style.padding = `${this.borderThickness}px`;
        b.style.background = gradient;
        b.style.mask = 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)';
      }

      b.style.borderRadius = radius > 0 ? `${radius}px` : '';
      b.style.display = '';
    } else if (this.borderElement !== null)
      this.borderElement.style.display = 'none';

    // Edge effect: drawn before (below) the children, outside the mask.
    const e = this.edgeEffect;

    if (e.type !== EdgeEffectType.None && e.radius > 0 && e.colour.a > 0) {
      if (this.edgeEffectElement === null) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        this.element.insertBefore(el, mask);
        this.edgeEffectElement = el;
      }

      // Alpha is multiplied by our draw alpha (RGB is not tinted), as in drawEdgeEffect.
      const colour = e.colour.opacity(e.colour.a * drawColour.averageColour.a);
      const size = this.drawSize;
      const el = this.edgeEffectElement;
      const css = edgeEffectCss({ width: size.x, height: size.y, cornerRadius: radius + e.roundness, radius: e.radius, hollow: e.hollow, colour });

      el.style.left = `${e.offset.x - e.radius}px`;
      el.style.top = `${e.offset.y - e.radius}px`;
      el.style.width = `${css.width}px`;
      el.style.height = `${css.height}px`;
      el.style.backgroundImage = css.backgroundImage;
      el.style.backgroundSize = css.backgroundSize;
      el.style.backgroundPosition = css.backgroundPosition;
      el.style.backgroundRepeat = 'no-repeat';
      // Glow is drawn additively, shadows with regular alpha blending.
      el.style.mixBlendMode = e.type === EdgeEffectType.Glow ? 'plus-lighter' : 'normal';
      el.style.display = '';
    } else if (this.edgeEffectElement !== null)
      this.edgeEffectElement.style.display = 'none';
  }

  // #endregion

  // #region Transforms

  override get removeCompletedTransforms(): boolean {
    return super.removeCompletedTransforms;
  }

  override set removeCompletedTransforms(value: boolean) {
    if (super.removeCompletedTransforms === value)
      return;

    super.removeCompletedTransforms = value;

    for (const c of this.internalChildrenList.toArray())
      c.removeCompletedTransforms = this.removeCompletedTransforms;
  }

  override applyTransformsAt(time: number, propagateChildren = false): void {
    super.applyTransformsAt(time, propagateChildren);

    if (!propagateChildren)
      return;

    for (const c of this.internalChildrenList.toArray())
      c.applyTransformsAt(time, true);
  }

  override clearTransformsAfter(time: number, propagateChildren = false, targetMember: string | null = null): void {
    super.clearTransformsAfter(time, propagateChildren, targetMember);

    if (this.autoSizeAxes !== Axes.None && this.autoSizeDuration > 0)
      this.childrenSizeDependencies.invalidate();

    if (!propagateChildren)
      return;

    for (const c of this.internalChildrenList.toArray())
      c.clearTransformsAfter(time, true, targetMember);
  }

  override addDelay(duration: number, propagateChildren = false): void {
    if (duration === 0)
      return;

    super.addDelay(duration, propagateChildren);

    if (propagateChildren) {
      for (const c of this.internalChildrenList.toArray())
        c.addDelay(duration, true);
    }
  }

  /** Schedules a task to run after children have been updated (or after transformDelay). */
  protected scheduleAfterChildren(action: () => void): ScheduledDelegate {
    if (this.transformDelay > 0)
      return this.schedulerAfterChildren.addDelayed(action, this.transformDelay);

    return this.schedulerAfterChildren.add(action)!;
  }

  override beginAbsoluteSequence(newTransformStartTime: number, recursive = true): Disposable & { dispose(): void } {
    if (!recursive || this.internalChildrenList.count === 0)
      return super.beginAbsoluteSequence(newTransformStartTime, false);

    const actions: AbsoluteSequenceSender[] = [];

    super.collectAbsoluteSequenceActionsFromSubTree(newTransformStartTime, actions);

    for (const c of this.internalChildrenList.toArray())
      c.collectAbsoluteSequenceActionsFromSubTree(newTransformStartTime, actions);

    return new InvokeOnDisposal(() => {
      for (const a of actions)
        a.dispose();
    });
  }

  override collectAbsoluteSequenceActionsFromSubTree(newTransformStartTime: number, actions: AbsoluteSequenceSender[]): void {
    super.collectAbsoluteSequenceActionsFromSubTree(newTransformStartTime, actions);

    for (const c of this.internalChildrenList.toArray())
      c.collectAbsoluteSequenceActionsFromSubTree(newTransformStartTime, actions);
  }

  override finishTransforms(propagateChildren = false, targetMember: string | null = null): void {
    super.finishTransforms(propagateChildren, targetMember);

    if (propagateChildren) {
      // Use for over foreach as collection may grow due to abort / completion events.
      // Note that this may mean that in the addition of elements being removed,
      // `FinishTransforms` may not be called on all items.
      for (let i = 0; i < this.internalChildrenList.count; i++)
        this.internalChildrenList.get(i).finishTransforms(true, targetMember);
    }
  }

  /** Helper function for creating and adding a transform that fades the current EdgeEffect (alpha, or to a colour). (Public, as C#'s IContainer extension.) */
  fadeEdgeEffectTo(newAlphaOrColour: number | Colour4, duration = 0, easing = Easing.None): TransformSequence<this> {
    const target = typeof newAlphaOrColour === 'number'
      ? new Colour4(this.edgeEffect.colour.r, this.edgeEffect.colour.g, this.edgeEffect.colour.b, newAlphaOrColour)
      : newAlphaOrColour;

    return this.tweenEdgeEffectTo(this.edgeEffect.with({ colour: target }), duration, easing);
  }

  /** Helper function for creating and adding a transform that tweens the current EdgeEffect to match the given parameters. */
  tweenEdgeEffectTo(newParams: EdgeEffectParameters, duration = 0, easing = Easing.None): TransformSequence<this> {
    return this.transformTo('edgeEffect', newParams, duration, easing);
  }

  // #endregion

  // #region Interaction / Input

  override contains(screenSpacePos: Vector2): boolean {
    const cRadius = this.effectiveCornerRadius;
    const cExponent = this.cornerExponent;

    // Select a cheaper contains method when we don't need rounded edges.
    if (cRadius === 0.0)
      return super.contains(screenSpacePos);

    return this.drawRectangle.shrink(cRadius).distanceExponentiated(this.toLocalSpace(screenSpacePos), cExponent) <= Math.pow(cRadius, cExponent);
  }

  /** Determines whether a child should be considered for input (it must be fully loaded). */
  protected shouldBeConsideredForInput(child: Drawable): boolean {
    return child.loadState === LoadState.Loaded;
  }

  override buildNonPositionalInputQueue(queue: Drawable[], allowBlocking = true): boolean {
    if (!super.buildNonPositionalInputQueue(queue, allowBlocking))
      return false;

    const children = this.aliveInternalChildrenList;

    for (let i = 0; i < children.count; ++i) {
      if (this.shouldBeConsideredForInput(children.get(i)))
        children.get(i).buildNonPositionalInputQueue(queue, allowBlocking);
    }

    return true;
  }

  /** Determines whether the subtree should receive positional input when the mouse is at the given screen-space position. */
  protected receivePositionalInputAtSubTree(screenSpacePos: Vector2): boolean {
    return !this.masking || this.receivePositionalInputAt(screenSpacePos);
  }

  override buildPositionalInputQueue(screenSpacePos: Vector2, queue: Drawable[]): boolean {
    if (!super.buildPositionalInputQueue(screenSpacePos, queue))
      return false;

    if (!this.receivePositionalInputAtSubTree(screenSpacePos))
      return false;

    const children = this.aliveInternalChildrenList;

    for (let i = 0; i < children.count; ++i) {
      if (this.shouldBeConsideredForInput(children.get(i)))
        children.get(i).buildPositionalInputQueue(screenSpacePos, queue);
    }

    return true;
  }

  // #endregion

  // #region Masking and related effects (e.g. round corners)

  private _masking = false;

  /** If enabled, only the portion of children that falls within this CompositeDrawable's shape is drawn to the screen. */
  get masking(): boolean {
    return this._masking;
  }

  set masking(value: boolean) {
    if (this._masking === value)
      return;

    this._masking = value;

    // DrawInfo invalidation will propagate masking bounds changes in the sub-tree.
    // While this can invalidate other layouts, there are rarely any use cases of enabling/disabling masking "on the fly"
    // so this won't hurt performance under normal circumstances.
    this.invalidate(Invalidation.DrawNode | Invalidation.DrawInfo);
  }

  private _maskingSmoothness = 1;

  /** Determines over how many pixels the alpha component smoothly fades out. Only has an effect when masking is true. */
  get maskingSmoothness(): number {
    return this._maskingSmoothness;
  }

  set maskingSmoothness(value: number) {
    //must be above zero to avoid a div-by-zero in the shader logic.
    value = Math.max(0.01, value);

    if (this._maskingSmoothness === value)
      return;

    this._maskingSmoothness = value;
    this.invalidate(Invalidation.DrawNode);
  }

  private _cornerRadius = 0;

  /** Determines how large of a radius is masked away around the corners. Only has an effect when masking is true. */
  get cornerRadius(): number {
    return this._cornerRadius;
  }

  set cornerRadius(value: number) {
    if (this._cornerRadius === value)
      return;

    this._cornerRadius = value;
    this.invalidate(Invalidation.DrawNode);
  }

  private _cornerExponent = 2;

  /**
   * Determines how gentle the curve of the corner straightens. A value of 2 results in circular arcs.
   * DOM limitation: CSS border-radius is always circular; only effectiveCornerRadius honours the exponent.
   */
  get cornerExponent(): number {
    return this._cornerExponent;
  }

  set cornerExponent(value: number) {
    if (!Precision.definitelyBigger(value, 0) || value > 10)
      throw new RangeError('CornerExponent may not be <=0 or >10 for numerical correctness.');

    if (this._cornerExponent === value)
      return;

    this._cornerExponent = value;
    this.invalidate(Invalidation.DrawNode);
  }

  // This _hacky_ modification of the corner radius (obtained from playing around) ensures that the corner remains at roughly
  // equal size (perceptually) compared to the circular arc as the CornerExponent is adjusted within the range ~2-5.
  private get effectiveCornerRadius(): number {
    return this.cornerRadius * 0.8 * this.cornerExponent / 2 + 0.2 * this.cornerRadius;
  }

  private _borderThickness = 0;

  /** Determines how thick of a border to draw around the inside of the masked region. Only has an effect when masking is true. */
  get borderThickness(): number {
    return this._borderThickness;
  }

  set borderThickness(value: number) {
    if (this._borderThickness === value)
      return;

    this._borderThickness = value;
    this.invalidate(Invalidation.DrawNode);
  }

  private _borderColour = ColourInfo.singleColour(Colour4.Black);

  /** Determines the color of the border controlled by borderThickness. Only has an effect when masking is true. */
  get borderColour(): ColourInfo {
    return this._borderColour;
  }

  set borderColour(value: ColourInfo | Colour4) {
    const v = ColourInfo.from(value);

    if (this._borderColour.equals(v))
      return;

    this._borderColour = v;
    this.invalidate(Invalidation.DrawNode);
  }

  private _edgeEffect = new EdgeEffectParameters();

  /** Determines an edge effect of this CompositeDrawable. Edge effects are e.g. glow or a shadow. Only has an effect when masking is true. */
  get edgeEffect(): EdgeEffectParameters {
    return this._edgeEffect;
  }

  set edgeEffect(value: EdgeEffectParameters) {
    if (this._edgeEffect.equals(value))
      return;

    this._edgeEffect = value;
    this.invalidate(Invalidation.DrawNode);
  }

  // #endregion

  // #region Sizing

  override get boundingBox(): RectangleF {
    const cRadius = this.cornerRadius;
    if (cRadius === 0.0)
      return super.boundingBox;

    const drawRect = this.layoutRectangle.shrink(cRadius);

    // Inflate bounding box in parent space by the half-size of the bounding box of the
    // ellipse obtained by transforming the unit circle into parent space.
    const offset = this.toParentSpace(Vector2.Zero);
    const u = this.toParentSpace(new Vector2(cRadius, 0)).sub(offset);
    const v = this.toParentSpace(new Vector2(0, cRadius)).sub(offset);
    const inflation = new Vector2(
      Math.sqrt(u.x * u.x + v.x * v.x),
      Math.sqrt(u.y * u.y + v.y * v.y),
    );

    let result = this.toParentSpaceRect(drawRect).aabbFloat.inflate(inflation);

    // The above algorithm will return incorrect results if the rounded corners are not fully visible.
    // To limit bad behavior we at least enforce here, that the bounding box with rounded corners
    // is never larger than the bounding box without.
    if (this.drawSize.x < this.cornerRadius * 2 || this.drawSize.y < this.cornerRadius * 2)
      result = result.intersect(super.boundingBox);

    return result;
  }

  private _padding = MarginPadding.Zero;

  /** Shrinks the space children may occupy within this CompositeDrawable by the specified amount on each side. */
  get padding(): MarginPadding {
    return this._padding;
  }

  set padding(value: MarginPadding) {
    if (this._padding.equals(value)) return;

    if (![value.top, value.left, value.bottom, value.right].every(Number.isFinite)) throw new Error(`Padding must be finite, but is ${value}.`);

    this._padding = value;

    for (const c of this.internalChildrenList.toArray())
      c.invalidate(c.invalidationFromParentSize | Invalidation.MiscGeometry);
  }

  /** The size of the coordinate space revealed to internalChildren. */
  get childSize(): Vector2 {
    return this.drawSize.sub(new Vector2(this.padding.totalHorizontal, this.padding.totalVertical));
  }

  /** Positional offset applied to internalChildren. */
  get childOffset(): Vector2 {
    return new Vector2(this.padding.left, this.padding.top);
  }

  private _relativeChildSize = Vector2.One;

  /** Determines the scale of relative positions and sizes of children (an internal coordinate system). */
  get relativeChildSize(): Vector2 {
    return this._relativeChildSize;
  }

  set relativeChildSize(value: Vector2) {
    if (this._relativeChildSize.equals(value))
      return;

    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error(`RelativeChildSize must be finite, but is ${value}.`);
    if (value.x === 0 || value.y === 0) throw new Error(`RelativeChildSize must be non-zero, but is ${value}.`);

    this._relativeChildSize = value;

    for (const c of this.internalChildrenList.toArray())
      c.invalidate(c.invalidationFromParentSize);
  }

  private _relativeChildOffset = Vector2.Zero;

  /** The offset of the internal coordinate system of relative positions (subtracted from children's relative positions). */
  get relativeChildOffset(): Vector2 {
    return this._relativeChildOffset;
  }

  set relativeChildOffset(value: Vector2) {
    if (this._relativeChildOffset.equals(value))
      return;

    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error(`RelativeChildOffset must be finite, but is ${value}.`);

    this._relativeChildOffset = value;

    for (const c of this.internalChildrenList.toArray())
      c.invalidate(c.invalidationFromParentSize & ~Invalidation.DrawSize);
  }

  /** Conversion factor from relative to absolute coordinates in our space. */
  get relativeToAbsoluteFactor(): Vector2 {
    return this.childSize.div(this.relativeChildSize);
  }

  /** Tweens the relativeChildSize of this CompositeDrawable. */
  protected transformRelativeChildSizeTo(newSize: Vector2, duration = 0, easing = Easing.None): TransformSequence<this> {
    if (newSize.x === 0 || newSize.y === 0)
      throw new Error(`newSize must be non-zero, but is ${newSize}.`);

    return this.transformTo('relativeChildSize', newSize, duration, easing);
  }

  /** Tweens the relativeChildOffset of this CompositeDrawable. */
  protected transformRelativeChildOffsetTo(newOffset: Vector2, duration = 0, easing = Easing.None): TransformSequence<this> {
    return this.transformTo('relativeChildOffset', newOffset, duration, easing);
  }

  override get relativeSizeAxes(): Axes {
    return super.relativeSizeAxes;
  }

  override set relativeSizeAxes(value: Axes) {
    if ((this.autoSizeAxes & value) !== 0)
      throw new Error('No axis can be relatively sized and automatically sized at the same time.');

    super.relativeSizeAxes = value;
  }

  private _autoSizeAxes = Axes.None;

  /** Controls which Axes are automatically sized w.r.t. internalChildren's bounds. */
  get autoSizeAxes(): Axes {
    return this._autoSizeAxes;
  }

  set autoSizeAxes(value: Axes) {
    if (value === this._autoSizeAxes)
      return;

    if ((this.relativeSizeAxes & value) !== 0)
      throw new Error('No axis can be relatively sized and automatically sized at the same time.');

    this._autoSizeAxes = value;

    if (value === Axes.None)
      this.childrenSizeDependencies.validate();
    else
      this.childrenSizeDependencies.invalidate();

    this.onSizingChanged();
  }

  /** The duration which automatic sizing should take. If zero, then it is instantaneous. Otherwise, this is equivalent to applying an automatic size via a resize transform. */
  autoSizeDuration = 0;

  /** The type of easing which should be used for smooth automatic sizing when autoSizeDuration is non-zero. */
  autoSizeEasing = Easing.None;

  /** @internal Fired after this CompositeDrawable's Size is updated through autosize. */
  onAutoSize: (() => void) | null = null;

  /** @internal */ get childrenSizeDependenciesIsValid(): boolean {
    return this.childrenSizeDependencies.isValid;
  }

  private readonly childrenSizeDependencies = new LayoutValue(Invalidation.RequiredParentSizeToFit | Invalidation.Presence, InvalidationSource.Child);

  override get width(): number {
    if (!this.isComputingChildrenSizeDependencies && (this.autoSizeAxes & Axes.X) !== 0)
      this.updateChildrenSizeDependencies();

    return super.width;
  }

  override set width(value: number) {
    if ((this.autoSizeAxes & Axes.X) !== 0)
      throw new Error('The width of a CompositeDrawable with AutoSizeAxes can not be set manually.');

    super.width = value;
  }

  override get height(): number {
    if (!this.isComputingChildrenSizeDependencies && (this.autoSizeAxes & Axes.Y) !== 0)
      this.updateChildrenSizeDependencies();

    return super.height;
  }

  override set height(value: number) {
    if ((this.autoSizeAxes & Axes.Y) !== 0)
      throw new Error('The height of a CompositeDrawable with AutoSizeAxes can not be set manually.');

    super.height = value;
  }

  private isComputingChildrenSizeDependencies = false;

  override get size(): Vector2 {
    if (!this.isComputingChildrenSizeDependencies && this.autoSizeAxes !== Axes.None)
      this.updateChildrenSizeDependencies();

    return super.size;
  }

  override set size(value: Vector2) {
    if ((this.autoSizeAxes & Axes.Both) !== 0)
      throw new Error('The Size of a CompositeDrawable with AutoSizeAxes can not be set manually.');

    super.size = value;
  }

  private computeAutoSize(): Vector2 {
    const originalPadding = this.padding;
    const originalMargin = this.margin;

    try {
      this.padding = MarginPadding.Zero;
      this.margin = MarginPadding.Zero;

      if (this.autoSizeAxes === Axes.None) return this.drawSize;

      let maxX = 0;
      let maxY = 0;

      // Find the maximum width/height of children
      for (const c of this.aliveInternalChildrenList.toArray()) {
        if (!c.isPresent)
          continue;

        const cBound = c.requiredParentSizeToFit;

        if ((c.bypassAutoSizeAxes & Axes.X) === 0)
          maxX = Math.max(maxX, cBound.x);

        if ((c.bypassAutoSizeAxes & Axes.Y) === 0)
          maxY = Math.max(maxY, cBound.y);
      }

      if ((this.autoSizeAxes & Axes.X) === 0)
        maxX = this.drawSize.x;
      if ((this.autoSizeAxes & Axes.Y) === 0)
        maxY = this.drawSize.y;

      return new Vector2(maxX, maxY);
    } finally {
      this.padding = originalPadding;
      this.margin = originalMargin;
    }
  }

  private updateAutoSize(): void {
    if (this.autoSizeAxes === Axes.None)
      return;

    const b = this.computeAutoSize().add(this.padding.total);

    this.autoSizeResizeTo(new Vector2(
      (this.autoSizeAxes & Axes.X) !== 0 ? b.x : super.width,
      (this.autoSizeAxes & Axes.Y) !== 0 ? b.y : super.height,
    ), this.autoSizeDuration, this.autoSizeEasing);

    //note that this is called before autoSize becomes valid. may be something to consider down the line.
    //might work better to add an OnRefresh event in Cached<> and invoke there.
    this.onAutoSize?.();
  }

  private updateChildrenSizeDependencies(): void {
    this.isComputingChildrenSizeDependencies = true;

    try {
      if (!this.childrenSizeDependencies.isValid) {
        this.updateAutoSize();
        this.childrenSizeDependencies.validate();
      }
    } finally {
      this.isComputingChildrenSizeDependencies = false;
    }
  }

  private autoSizeResizeTo(newSize: Vector2, duration = 0, easing = Easing.None): void {
    const currentTransform = this.transformsForTargetMember('baseSize')[0] as AutoSizeTransform | undefined;

    if (!(currentTransform?.endValue ?? this.size).equals(newSize)) {
      if (duration === 0) {
        if (currentTransform !== undefined)
          this.clearTransforms(false, 'baseSize');

        this.baseSize = newSize;
      } else {
        const t = new AutoSizeTransform();
        t.rewindable = false;
        this.applyTransform(this.populateTransform(t, newSize, duration, easing));
      }
    }
  }

  /** A helper property for autoSizeResizeTo to change the size of auto size containers. */
  private get baseSize(): Vector2 {
    return new Vector2(super.width, super.height);
  }

  private set baseSize(value: Vector2) {
    super.width = value.x;
    super.height = value.y;
  }

  // #endregion
}

class AutoSizeTransform extends TransformCustom<Vector2, CompositeDrawable> {
  constructor() {
    super('baseSize');
  }
}

const midColour = (a: Colour4, b: Colour4): Colour4 => new Colour4((a.r + b.r) / 2, (a.g + b.g) / 2, (a.b + b.b) / 2, (a.a + b.a) / 2);
