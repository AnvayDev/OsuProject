// Ported from osu.Framework/Graphics/Drawable.cs (+ the Drawable part of TransformableExtensions.cs).
//
// Rendering: instead of DrawNodes, every Drawable owns one absolutely-positioned HTMLElement.
// Each frame, after update, the host walks the drawn tree (same rules as CompositeDrawable.addFromComposite) and calls
// validateElement() on every drawn drawable; it rewrites styles only when InvalidationID changed (as ApplyState would).
// Geometry is written as the local part of DrawInfo (parent space -> element), computed with the exact DrawInfo.ApplyTransform math.
// Colour/alpha are never applied as CSS opacity on containers: like osu!, leaves draw with DrawColourInfo (alpha multiplied down the tree).
//
// Input handlers live in Drawable.input.ts (added with the InputManager port).

import { isFocusManager, type IFocusManager } from '../input/IFocusManager';
import { type IReadOnlyDependencyContainer } from '../allocation/DependencyContainer';
import { Signal } from '../bindables/Signal';
import { Anchor, Axes, FillMode, Invalidation, LoadState, RotationDirection } from '../layout/Enums';
import { InvalidationList, InvalidationSource, LayoutMember, LayoutValueOf } from '../layout/Layout';
import { MarginPadding } from '../layout/MarginPadding';
import { Precision, Quad, RectangleF } from '../layout/Primitives';
import { Vector2 } from '../layout/Vector2';
import { type IFrameBasedClock } from '../timing/IClock';
import { Scheduler, type ScheduledDelegate } from '../timing/Scheduler';
import { Easing, type IEasingFunction } from '../transforms/Easing';
import { valueAt } from '../transforms/Interpolation';
import { Transform } from '../transforms/Transform';
import { Transformable } from '../transforms/Transformable';
import { TransformSequence } from '../transforms/TransformSequence';
import { Colour4 } from './Colour4';
import {
  ClickEvent, DoubleClickEvent, DragEndEvent, DragEvent, DragStartEvent, FocusEvent, FocusLostEvent, HoverEvent, HoverLostEvent,
  KeyDownEvent, KeyUpEvent, MouseDownEvent, MouseMoveEvent, MouseUpEvent, ScrollEvent, type UIEvent,
} from '../input/events/UIEvents';
import { InputState } from '../input/InputState';
import { MouseButton } from '../input/Key';
import { ColourInfo } from './ColourInfo';
import { BlendingParameters, DrawColourInfo, DrawInfo } from './DrawInfo';
import type { CompositeDrawable } from './containers/CompositeDrawable';
import type { InputManager } from '../input/InputManager';

type ColourLike = Colour4 | ColourInfo;

/** Properties assignable through Drawable.with(); colour-typed setters accept Colour4 as well as ColourInfo. */
export type DrawableInit<T> = Partial<Omit<T, 'colour' | 'borderColour' | 'children' | 'child'>> & {
  colour?: ColourLike;
  borderColour?: ColourLike;
  children?: Iterable<Drawable>;
  child?: Drawable;
};

const isFinite2 = (v: Vector2) => Number.isFinite(v.x) && Number.isFinite(v.y);

const visibility_cutoff = 0.0001;

const MIN_VALUE = -Number.MAX_VALUE;
const MAX_VALUE = Number.MAX_VALUE;

/** Drawables are the basic building blocks of a scene graph in this framework. Anything that is visible or that the user interacts with has to be a Drawable. */
export abstract class Drawable extends Transformable {
  // #region Construction and disposal

  /** The DOM element representing this drawable. */
  readonly element: HTMLElement;

  constructor() {
    super();

    this.element = this.createElement();

    this.addLayout(this.drawInfoBacking);
    this.addLayout(this.drawSizeBacking);
    this.addLayout(this.screenSpaceDrawQuadBacking);
    this.addLayout(this.drawColourInfoBacking);
    this.addLayout(this.requiredParentSizeToFitBacking);
    this.addLayout(this.maskingBacking);
  }

  /** Creates the element representing this drawable. Override to use a different tag (e.g. a canvas). */
  protected createElement(): HTMLElement {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.transformOrigin = '0 0';
    el.style.boxSizing = 'border-box';
    el.style.pointerEvents = 'none';
    return el;
  }

  /** Disposes this drawable. */
  dispose(): void {
    this.disposeInternal(true);
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  private _isDisposed = false;

  protected disposeInternal(_isDisposing: boolean): void {
    if (this._isDisposed)
      return;

    this.unbindAllBindables();

    // Bypass expensive operations as a result of setting the Parent property, by setting the field directly.
    this._parent = null;
    this.childID = 0;

    this.onUpdate.clear();
    this.invalidated.clear();

    this.onDispose?.();
    this.onDispose = null;

    this.element.remove();

    this._isDisposed = true;
  }

  /** Whether this Drawable should be disposed when it is automatically removed from its parent due to ShouldBeAlive being false. */
  get disposeOnDeathRemoval(): boolean {
    return this.removeCompletedTransforms;
  }

  /** @internal Recursively invokes unbindAllBindables on this Drawable and all Drawables further down the scene graph. */
  unbindAllBindablesSubTree(): void {
    this.unbindAllBindables();
  }

  private unbindComplete = false;

  /**
   * Unbinds all bindables stored as fields of this drawable (C# finds IUnbindable fields via reflection;
   * here, any own property value with an unbindAll() method).
   */
  /** @internal */ unbindAllBindables(): void {
    if (this.unbindComplete)
      return;

    this.unbindComplete = true;

    for (const value of Object.values(this)) {
      if (value !== null && typeof value === 'object' && !(value instanceof Drawable) && typeof (value as { unbindAll?: unknown }).unbindAll === 'function') {
        try {
          (value as { unbindAll(): void }).unbindAll();
        } catch (e) {
          console.error(`Failed to unbind a local bindable in ${this.constructor.name}`, e);
        }
      }
    }

    this.onUnbindAllBindables?.();
  }

  // #endregion

  // #region Loading

  /** Whether this Drawable is fully loaded. This is true iff UpdateSubTree() and/or UpdateSubTreeMasking() have run once on this Drawable. */
  get isLoaded(): boolean {
    return this._loadState >= LoadState.Loaded;
  }

  private _loadState = LoadState.NotLoaded;

  /** Describes the current state of this Drawable within the loading pipeline. */
  get loadState(): LoadState {
    return this._loadState;
  }

  private loadPromise: Promise<void> | null = null;

  /**
   * @internal Loads this drawable, including the gathering of dependencies and initialisation of required resources.
   * Returns a promise when the load (or a child's load) is asynchronous; the drawable becomes Ready when it resolves.
   */
  loadDrawable(clock: IFrameBasedClock | null, dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    if (this._isDisposed)
      throw new Error(`Cannot load disposed drawable ${this}.`);

    if (this._loadState === LoadState.NotLoaded) {
      this._loadState = LoadState.Loading;

      this.updateClock(clock);

      this.requestsNonPositionalInput = HandleInputCache.requestsNonPositionalInput(this);
      this.requestsPositionalInput = HandleInputCache.requestsPositionalInput(this);

      this.requestsNonPositionalInputSubTree = this.requestsNonPositionalInput;
      this.requestsPositionalInputSubTree = this.requestsPositionalInput;

      const result = this.injectDependencies(dependencies);

      if (result instanceof Promise) {
        this.loadPromise = result.then(() => {
          this.loadAsyncComplete();
          this._loadState = LoadState.Ready;
        });
        return this.loadPromise;
      }

      this.loadAsyncComplete();
      this._loadState = LoadState.Ready;
      return;
    }

    if (this._loadState === LoadState.Loading)
      return this.loadPromise ?? undefined;
  }

  /** Injects dependencies into this drawable (runs the [BackgroundDependencyLoader] chain, i.e. load()). */
  protected injectDependencies(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    return this.load(dependencies);
  }

  /**
   * The [BackgroundDependencyLoader] method. Overrides must call super.load(dependencies) first (and await it if it returns a promise),
   * matching osu!framework running every loader in the hierarchy from the base class down.
   */
  protected load(_dependencies: IReadOnlyDependencyContainer): Promise<void> | void {}

  /** Runs once on the update thread after loading has finished. */
  private loadCompleteInternal(): boolean {
    if (this._loadState < LoadState.Ready) return false;

    this._loadState = LoadState.Loaded;

    // From a synchronous point of view, this is the first time the Drawable receives a parent.
    // If this Drawable calculated properties such as DrawInfo that depend on the parent state before this point, they must be re-validated in the now-correct state.
    // A "parent" source is faked since Child+Self states are always assumed valid if they only access local Drawable states (e.g. Colour but not DrawInfo).
    // Only layout flags are required, as non-layout flags are always propagated by the parent.
    this.invalidate(Invalidation.Layout, InvalidationSource.Parent);

    this.loadComplete();

    this.onLoadComplete.emit(this);
    this.onLoadComplete.clear();

    return true;
  }

  /** Invoked after dependency injection has completed for this Drawable and all children if this is a CompositeDrawable. */
  protected loadAsyncComplete(): void {}

  /** Invoked after this Drawable has finished loading and has been added to the scene graph (first update). */
  protected loadComplete(): void {}

  // #endregion

  // #region Sorting (CreationID / Depth)

  /** @internal Captures the order in which Drawables were added to a CompositeDrawable. Each Drawable is assigned a monotonically increasing ID upon being added. */
  childID = 0;

  /** @internal */ get isPartOfComposite(): boolean {
    return this.childID !== 0;
  }

  /** Whether this drawable is alive. */
  isAlive = false;

  private _depth = 0;

  /** Controls which Drawables are behind or in front of other Drawables. This amounts to sorting Drawables by their Depth. A Drawable with higher Depth will be drawn behind. */
  get depth(): number {
    return this._depth;
  }

  set depth(value: number) {
    if (this.isPartOfComposite) {
      throw new Error('May not change Depth while inside a parent CompositeDrawable.'
        + 'Use the parent\'s ChangeInternalChildDepth or ChangeChildDepth instead.');
    }

    this._depth = value;
  }

  // #endregion

  // #region Periodic tasks (events, Scheduler, Transforms, Update)

  /** This event is fired after the update() method is called at the end of updateSubTree(). */
  readonly onUpdate = new Signal<Drawable>();

  /** This event is fired after the loadComplete() method is called (handlers are cleared afterwards). */
  readonly onLoadComplete = new Signal<Drawable>();

  /** @internal Fired after the invalidate method is called. */
  readonly invalidated = new Signal<[Drawable, Invalidation]>();

  /** @internal */ onDispose: (() => void) | null = null;
  /** @internal */ onUnbindAllBindables: (() => void) | null = null;

  private _scheduler: Scheduler | null = null;

  /** A lazily-initialized scheduler used to schedule tasks to be invoked in future updates. */
  get scheduler(): Scheduler {
    return this._scheduler ??= new Scheduler(this.clock);
  }

  /** Updates this Drawable and all Drawables further down the scene graph. Called once every frame. Returns false if the drawable should not be updated. */
  updateSubTree(): boolean {
    if (this._isDisposed)
      throw new Error(`Disposed Drawables may never be in the scene graph. (${this})`);

    if (this.processCustomClock)
      this.customClock?.processFrame();

    if (this._loadState < LoadState.Ready)
      return false;

    if (this._loadState === LoadState.Ready)
      this.loadCompleteInternal();

    this.updateTransforms();

    if (!this.isPresent)
      return true;

    if (this._scheduler !== null)
      this._scheduler.update();

    this.update();
    this.onUpdate.emit(this);
    return true;
  }

  /** Computes the RectangleF where masking happens (the parent's ChildMaskingBounds). */
  computeMaskingBounds(): RectangleF {
    if (this.hasProxy)
      return this.proxy!.computeMaskingBounds();

    if (this._parent === null)
      return this.screenSpaceDrawQuad.aabbFloat;

    return this._parent.childMaskingBounds;
  }

  private lastMaskingBounds: RectangleF | null = null;

  /** Updates all masking calculations for this Drawable and its children. This occurs post-update. Returns false if this drawable is not present. */
  updateSubTreeMasking(): boolean {
    if (!this.isPresent)
      return false;

    const maskingBounds = this.computeMaskingBounds();

    if (!this.maskingBacking.isValid || this.lastMaskingBounds === null || !this.lastMaskingBounds.equals(maskingBounds)) {
      this.lastMaskingBounds = maskingBounds;
      this.isMaskedAway = this.maskingBacking.value = this.computeIsMaskedAway(maskingBounds);
    }

    return true;
  }

  /** Computes whether this Drawable is masked away. */
  protected computeIsMaskedAway(maskingBounds: RectangleF): boolean {
    return !Precision.almostIntersects(maskingBounds, this.screenSpaceDrawQuad.aabbFloat);
  }

  /** Performs a once-per-frame update specific to this Drawable. */
  protected update(): void {}

  // #endregion

  // #region Position / Size (with margin)

  private _x = 0;
  private _y = 0;

  /** Positional offset of Origin to RelativeAnchorPosition in the Parent's coordinate system. May be in absolute or relative units (controlled by RelativePositionAxes). */
  get position(): Vector2 {
    return new Vector2(this._x, this._y);
  }

  set position(value: Vector2) {
    if (this._x === value.x && this._y === value.y) return;

    if (!isFinite2(value)) throw new Error(`Position must be finite, but is ${value}.`);

    let changedAxes = Axes.None;

    if (this._x !== value.x)
      changedAxes |= Axes.X;

    if (this._y !== value.y)
      changedAxes |= Axes.Y;

    this._x = value.x;
    this._y = value.y;

    this.invalidateParentSizeDependencies(Invalidation.MiscGeometry, changedAxes);
  }

  /** X component of Position. */
  get x(): number {
    return this._x;
  }

  set x(value: number) {
    if (this._x === value) return;

    if (!Number.isFinite(value)) throw new Error(`X must be finite, but is ${value}.`);

    this._x = value;

    this.invalidateParentSizeDependencies(Invalidation.MiscGeometry, Axes.X);
  }

  /** Y component of Position. */
  get y(): number {
    return this._y;
  }

  set y(value: number) {
    if (this._y === value) return;

    if (!Number.isFinite(value)) throw new Error(`Y must be finite, but is ${value}.`);

    this._y = value;

    this.invalidateParentSizeDependencies(Invalidation.MiscGeometry, Axes.Y);
  }

  private _relativePositionAxes = Axes.None;

  /** Controls which Axes of Position are relative w.r.t. the Parent's size (from 0 to 1) rather than absolute. */
  get relativePositionAxes(): Axes {
    return this._relativePositionAxes;
  }

  set relativePositionAxes(value: Axes) {
    if (value === this._relativePositionAxes)
      return;

    // Convert coordinates from relative to absolute or vice versa
    const conversion = this.parentRelativeToAbsoluteFactor;

    if ((value & Axes.X) > (this._relativePositionAxes & Axes.X))
      this.x = Precision.almostEquals(conversion.x, 0) ? 0 : this.x / conversion.x;
    else if ((this._relativePositionAxes & Axes.X) > (value & Axes.X))
      this.x *= conversion.x;

    if ((value & Axes.Y) > (this._relativePositionAxes & Axes.Y))
      this.y = Precision.almostEquals(conversion.y, 0) ? 0 : this.y / conversion.y;
    else if ((this._relativePositionAxes & Axes.Y) > (value & Axes.Y))
      this.y *= conversion.y;

    this._relativePositionAxes = value;

    this.updateBypassAutoSizeAxes();
  }

  /** Absolute positional offset of Origin to RelativeAnchorPosition in the Parent's coordinate system. */
  get drawPosition(): Vector2 {
    let offset = Vector2.Zero;

    if (this._parent !== null && this.relativePositionAxes !== Axes.None) {
      const rco = this._parent.relativeChildOffset;
      offset = new Vector2(
        (this.relativePositionAxes & Axes.X) !== 0 ? rco.x : 0,
        (this.relativePositionAxes & Axes.Y) !== 0 ? rco.y : 0);
    }

    return this.applyRelativeAxes(this.relativePositionAxes, this.position.sub(offset), FillMode.Stretch);
  }

  private _width = 0;
  private _height = 0;

  /** Size of this Drawable in the Parent's coordinate system. May be in absolute or relative units (controlled by RelativeSizeAxes). */
  get size(): Vector2 {
    return new Vector2(this._width, this._height);
  }

  set size(value: Vector2) {
    if (this._width === value.x && this._height === value.y) return;

    if (!isFinite2(value)) throw new Error(`Size must be finite, but is ${value}.`);

    let changedAxes = Axes.None;

    if (this._width !== value.x)
      changedAxes |= Axes.X;

    if (this._height !== value.y)
      changedAxes |= Axes.Y;

    this._width = value.x;
    this._height = value.y;

    this.invalidateParentSizeDependencies(Invalidation.DrawSize, changedAxes);
  }

  /** X component of Size. */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width === value) return;

    if (!Number.isFinite(value)) throw new Error(`Width must be finite, but is ${value}.`);

    this._width = value;

    this.invalidateParentSizeDependencies(Invalidation.DrawSize, Axes.X);
  }

  /** Y component of Size. */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height === value) return;

    if (!Number.isFinite(value)) throw new Error(`Height must be finite, but is ${value}.`);

    this._height = value;

    this.invalidateParentSizeDependencies(Invalidation.DrawSize, Axes.Y);
  }

  private _relativeSizeAxes = Axes.None;

  /** Controls which Axes are relative sizes w.r.t. Parent's size (from 0 to 1) in the Parent's coordinate system, rather than absolute sizes. */
  get relativeSizeAxes(): Axes {
    return this._relativeSizeAxes;
  }

  set relativeSizeAxes(value: Axes) {
    if (value === this._relativeSizeAxes)
      return;

    // In some cases we cannot easily preserve our size, and so we simply invalidate and
    // leave correct sizing to the user.
    if (this._fillMode !== FillMode.Stretch && (value === Axes.Both || this._relativeSizeAxes === Axes.Both))
      this.invalidate(Invalidation.DrawSize);
    else {
      // Convert coordinates from relative to absolute or vice versa
      const conversion = this.parentRelativeToAbsoluteFactor;

      if ((value & Axes.X) > (this._relativeSizeAxes & Axes.X))
        this.width = Precision.almostEquals(conversion.x, 0) ? 0 : this.width / conversion.x;
      else if ((this._relativeSizeAxes & Axes.X) > (value & Axes.X))
        this.width *= conversion.x;

      if ((value & Axes.Y) > (this._relativeSizeAxes & Axes.Y))
        this.height = Precision.almostEquals(conversion.y, 0) ? 0 : this.height / conversion.y;
      else if ((this._relativeSizeAxes & Axes.Y) > (value & Axes.Y))
        this.height *= conversion.y;
    }

    this._relativeSizeAxes = value;

    if ((this._relativeSizeAxes & Axes.X) !== 0 && this.width === 0) this.width = 1;
    if ((this._relativeSizeAxes & Axes.Y) !== 0 && this.height === 0) this.height = 1;

    this.updateBypassAutoSizeAxes();

    this.onSizingChanged();
  }

  private readonly drawSizeBacking = new LayoutValueOf<Vector2>(Invalidation.DrawInfo | Invalidation.RequiredParentSizeToFit | Invalidation.Presence);

  /** Absolute size of this Drawable in the Parent's coordinate system. */
  get drawSize(): Vector2 {
    return this.drawSizeBacking.isValid ? this.drawSizeBacking.value : (this.drawSizeBacking.value = this.applyRelativeAxes(this.relativeSizeAxes, this.size, this.fillMode));
  }

  /** X component of DrawSize. */
  get drawWidth(): number {
    return this.drawSize.x;
  }

  /** Y component of DrawSize. */
  get drawHeight(): number {
    return this.drawSize.y;
  }

  private _margin = MarginPadding.Zero;

  /** Size of an empty region around this Drawable used to manipulate layout. Does not affect DrawSize or the region of accepted input, but does affect LayoutSize. */
  get margin(): MarginPadding {
    return this._margin;
  }

  set margin(value: MarginPadding) {
    if (this._margin.equals(value)) return;

    if (![value.top, value.left, value.bottom, value.right].every(Number.isFinite)) throw new Error(`Margin must be finite, but is ${value}.`);

    this._margin = value;

    this.invalidate(Invalidation.MiscGeometry);
  }

  /** Absolute size of this Drawable's layout rectangle in the Parent's coordinate system; i.e. DrawSize with the addition of Margin. */
  get layoutSize(): Vector2 {
    return this.drawSize.add(new Vector2(this._margin.totalHorizontal, this._margin.totalVertical));
  }

  /** Absolutely sized rectangle for drawing in the Parent's coordinate system. Based on DrawSize. */
  get drawRectangle(): RectangleF {
    const s = this.drawSize;
    return new RectangleF(0, 0, s.x, s.y);
  }

  /** Absolutely sized rectangle for layout in the Parent's coordinate system. Based on LayoutSize. */
  get layoutRectangle(): RectangleF {
    const s = this.layoutSize;
    return new RectangleF(-this._margin.left, -this._margin.top, s.x, s.y);
  }

  /** Helper function for converting potentially relative coordinates in the Parent's space to absolute coordinates based on which axes are relative. */
  protected applyRelativeAxes(relativeAxes: Axes, v: Vector2, fillMode: FillMode): Vector2 {
    if (relativeAxes !== Axes.None) {
      const conversion = this.parentRelativeToAbsoluteFactor;

      let vx = v.x;
      let vy = v.y;

      if ((relativeAxes & Axes.X) !== 0)
        vx *= conversion.x;
      if ((relativeAxes & Axes.Y) !== 0)
        vy *= conversion.y;

      // FillMode only makes sense if both axes are relatively sized as the general rule
      // for n-dimensional aspect preservation is to simply take the minimum or the maximum
      // scale among all active axes. For single axes the minimum / maximum is just the
      // value itself.
      if (relativeAxes === Axes.Both && fillMode !== FillMode.Stretch) {
        if (fillMode === FillMode.Fill)
          vx = vy = Math.max(vx, vy * this._fillAspectRatio);
        else if (fillMode === FillMode.Fit)
          vx = vy = Math.min(vx, vy * this._fillAspectRatio);

        vy /= this._fillAspectRatio;
      }

      return new Vector2(vx, vy);
    }

    return v;
  }

  /** Conversion factor from relative to absolute coordinates in the Parent's space. */
  private get parentRelativeToAbsoluteFactor(): Vector2 {
    return this._parent?.relativeToAbsoluteFactor ?? Vector2.One;
  }

  private _bypassAutoSizeAxes = Axes.None;

  private updateBypassAutoSizeAxes(): void {
    const value = this.relativePositionAxes | this.relativeSizeAxes | this.bypassAutoSizeAdditionalAxes;

    if (this._bypassAutoSizeAxes !== value) {
      const changedAxes = this._bypassAutoSizeAxes ^ value;
      this._bypassAutoSizeAxes = value;
      if (((this._parent?.autoSizeAxes ?? 0) & changedAxes) !== 0)
        this._parent?.invalidate(Invalidation.RequiredParentSizeToFit, InvalidationSource.Child);
    }
  }

  private bypassAutoSizeAdditionalAxes = Axes.None;

  /** Controls which Axes are ignored by parent Parent's AutoSizeAxes during autosize computations. */
  get bypassAutoSizeAxes(): Axes {
    return this._bypassAutoSizeAxes;
  }

  set bypassAutoSizeAxes(value: Axes) {
    this.bypassAutoSizeAdditionalAxes = value;
    this.updateBypassAutoSizeAxes();
  }

  /** Computes the bounding box of this drawable in its parent's space. */
  get boundingBox(): RectangleF {
    return this.toParentSpaceRect(this.layoutRectangle).aabbFloat;
  }

  /** Called whenever the RelativeSizeAxes of this drawable is changed, or the sizing parameters of a CompositeDrawable are changed. */
  protected onSizingChanged(): void {}

  // #endregion

  // #region Scale / Shear / Rotation

  private _scale = Vector2.One;

  /** Base relative scaling factor around OriginPosition. */
  get scale(): Vector2 {
    return this._scale;
  }

  set scale(value: Vector2) {
    if (this._scale.equals(value))
      return;

    if (!isFinite2(value)) throw new Error(`Scale must be finite, but is ${value}.`);

    const wasPresent = this.isPresent;

    this._scale = value;

    if (this.isPresent !== wasPresent)
      this.invalidate(Invalidation.MiscGeometry | Invalidation.Presence);
    else
      this.invalidate(Invalidation.MiscGeometry);
  }

  private _fillAspectRatio = 1;

  /** The desired ratio of width to height when under the effect of a non-stretching FillMode and RelativeSizeAxes being Both. */
  get fillAspectRatio(): number {
    return this._fillAspectRatio;
  }

  set fillAspectRatio(value: number) {
    if (this._fillAspectRatio === value) return;

    if (!Number.isFinite(value)) throw new Error(`FillAspectRatio must be finite, but is ${value}.`);
    if (value === 0) throw new Error('FillAspectRatio must be non-zero.');

    this._fillAspectRatio = value;

    if (this._fillMode !== FillMode.Stretch && this.relativeSizeAxes === Axes.Both)
      this.invalidate(Invalidation.DrawSize);
  }

  private _fillMode = FillMode.Stretch;

  /** Controls the behavior of RelativeSizeAxes when it is set to Axes.Both. Otherwise, this member has no effect. By default, Stretch is used. */
  get fillMode(): FillMode {
    return this._fillMode;
  }

  set fillMode(value: FillMode) {
    if (this._fillMode === value) return;

    this._fillMode = value;

    this.invalidate(Invalidation.DrawSize);
  }

  /** Relative scaling factor around OriginPosition. */
  protected get drawScale(): Vector2 {
    return this.scale;
  }

  private _shear = Vector2.Zero;

  /** Relative shearing factor. The X dimension is relative w.r.t. Height and the Y dimension relative w.r.t. Width. */
  get shear(): Vector2 {
    return this._shear;
  }

  set shear(value: Vector2) {
    if (this._shear.equals(value)) return;

    if (!isFinite2(value)) throw new Error(`Shear must be finite, but is ${value}.`);

    this._shear = value;

    this.invalidate(Invalidation.MiscGeometry);
  }

  private _rotation = 0;

  /** Rotation in degrees around OriginPosition. */
  get rotation(): number {
    return this._rotation;
  }

  set rotation(value: number) {
    if (value === this._rotation) return;

    if (!Number.isFinite(value)) throw new Error(`Rotation must be finite, but is ${value}.`);

    this._rotation = value;

    this.invalidate(Invalidation.MiscGeometry);
  }

  // #endregion

  // #region Origin / Anchor

  private _origin = Anchor.TopLeft;

  /** The origin of this Drawable. */
  get origin(): Anchor {
    return this._origin;
  }

  set origin(value: Anchor) {
    if (this._origin === value) return;

    if ((value as number) === 0)
      throw new Error('Cannot set origin to 0.');

    this._origin = value;
    this.invalidate(Invalidation.MiscGeometry);
  }

  private customOrigin = Vector2.Zero;

  /** The origin of this Drawable expressed in relative coordinates from the top-left corner of DrawRectangle. */
  get relativeOriginPosition(): Vector2 {
    if (this.origin === Anchor.Custom)
      throw new Error('Can not obtain relative origin position for custom origins.');

    let x = 0;
    let y = 0;

    if ((this._origin & Anchor.x1) !== 0)
      x = 0.5;
    else if ((this._origin & Anchor.x2) !== 0)
      x = 1;

    if ((this._origin & Anchor.y1) !== 0)
      y = 0.5;
    else if ((this._origin & Anchor.y2) !== 0)
      y = 1;

    return new Vector2(x, y);
  }

  /** The origin of this Drawable expressed in absolute coordinates from the top-left corner of DrawRectangle. */
  get originPosition(): Vector2 {
    let result: Vector2;
    if (this.origin === Anchor.Custom)
      result = this.customOrigin;
    else if (this.origin === Anchor.TopLeft)
      result = Vector2.Zero;
    else
      result = Drawable.computeAnchorPosition(this.layoutSize, this.origin);

    return result.sub(new Vector2(this._margin.left, this._margin.top));
  }

  set originPosition(value: Vector2) {
    if (this.customOrigin.equals(value) && this.origin === Anchor.Custom)
      return;

    if (!isFinite2(value)) throw new Error(`OriginPosition must be finite, but is ${value}.`);

    this.customOrigin = value;
    this.origin = Anchor.Custom;

    this.invalidate(Invalidation.MiscGeometry);
  }

  private _anchor = Anchor.TopLeft;

  /** Specifies where Origin is attached to the Parent in the coordinate system with origin at the top left corner of the Parent's DrawRectangle. */
  get anchor(): Anchor {
    return this._anchor;
  }

  set anchor(value: Anchor) {
    if (this._anchor === value) return;

    if ((value as number) === 0)
      throw new Error('Cannot set anchor to 0.');

    this._anchor = value;
    this.invalidate(Invalidation.MiscGeometry);
  }

  private customRelativeAnchorPosition = Vector2.Zero;

  /** Specifies in relative coordinates where Origin is attached to the Parent. */
  get relativeAnchorPosition(): Vector2 {
    if (this.anchor === Anchor.Custom)
      return this.customRelativeAnchorPosition;

    let x = 0;
    let y = 0;

    if ((this._anchor & Anchor.x1) !== 0)
      x = 0.5;
    else if ((this._anchor & Anchor.x2) !== 0)
      x = 1;

    if ((this._anchor & Anchor.y1) !== 0)
      y = 0.5;
    else if ((this._anchor & Anchor.y2) !== 0)
      y = 1;

    return new Vector2(x, y);
  }

  set relativeAnchorPosition(value: Vector2) {
    if (this.customRelativeAnchorPosition.equals(value) && this.anchor === Anchor.Custom)
      return;

    if (!isFinite2(value)) throw new Error(`RelativeAnchorPosition must be finite, but is ${value}.`);

    this.customRelativeAnchorPosition = value;
    this.anchor = Anchor.Custom;

    this.invalidate(Invalidation.MiscGeometry);
  }

  /** Specifies in absolute coordinates where Origin is attached to the Parent. */
  get anchorPosition(): Vector2 {
    return this._parent !== null ? this.relativeAnchorPosition.mul(this._parent.childSize) : Vector2.Zero;
  }

  /** Helper function to compute an absolute position given an absolute size and a relative Anchor. */
  private static computeAnchorPosition(size: Vector2, anchor: Anchor): Vector2 {
    let x = 0;
    let y = 0;

    if ((anchor & Anchor.x1) !== 0)
      x = size.x / 2;
    else if ((anchor & Anchor.x2) !== 0)
      x = size.x;

    if ((anchor & Anchor.y1) !== 0)
      y = size.y / 2;
    else if ((anchor & Anchor.y2) !== 0)
      y = size.y;

    return new Vector2(x, y);
  }

  // #endregion

  // #region Colour / Alpha / Blending

  private _colour = ColourInfo.singleColour(Colour4.White);

  /** Colour of this Drawable. Will be multiplied down the tree (sRGB, in linear space). */
  get colour(): ColourInfo {
    return this._colour;
  }

  set colour(value: ColourLike) {
    const v = ColourInfo.from(value);

    if (this._colour.equals(v)) return;

    this._colour = v;

    this.invalidate(Invalidation.Colour);
  }

  private _alpha = 1.0;

  /** Multiplicative alpha factor applied on top of ColourInfo and its existing alpha channel(s). */
  get alpha(): number {
    return this._alpha;
  }

  set alpha(value: number) {
    if (this._alpha === value)
      return;

    const wasPresent = this.isPresent;

    this._alpha = value;

    if (this.isPresent !== wasPresent)
      this.invalidate(Invalidation.Colour | Invalidation.Presence);
    else
      this.invalidate(Invalidation.Colour);
  }

  /** Determines whether this Drawable is present based on its Alpha value. Can be forced always on with AlwaysPresent. */
  get isPresent(): boolean {
    return this.alwaysPresent || (this.alpha > visibility_cutoff && this.drawScale.x !== 0 && this.drawScale.y !== 0);
  }

  private _alwaysPresent = false;

  /** If true, we are always present, even with alpha 0 (e.g. to keep autosize and updates while invisible). */
  get alwaysPresent(): boolean {
    return this._alwaysPresent;
  }

  set alwaysPresent(value: boolean) {
    if (this._alwaysPresent === value)
      return;

    const wasPresent = this.isPresent;

    this._alwaysPresent = value;

    if (this.isPresent !== wasPresent)
      this.invalidate(Invalidation.Presence);
  }

  private _blending = BlendingParameters.Inherit;

  /** Determines how this Drawable is blended with other already drawn Drawables. Inherits the Parent's Blending by default. */
  get blending(): BlendingParameters {
    return this._blending;
  }

  set blending(value: BlendingParameters) {
    if (this._blending === value)
      return;

    this._blending = value;

    this.invalidate(Invalidation.Colour);
  }

  // #endregion

  // #region Timekeeping

  private customClock: IFrameBasedClock | null = null;
  private _clock: IFrameBasedClock | null = null;

  /** The clock of this drawable. Used for keeping track of time across frames. By default is inherited from Parent. */
  override get clock(): IFrameBasedClock | null {
    return this._clock;
  }

  override set clock(value: IFrameBasedClock | null) {
    this.customClock = value;
    this.updateClock(this.customClock);
  }

  /** @internal Updates the clock to be used. Has no effect if this drawable uses a custom clock. */
  updateClock(clock: IFrameBasedClock | null): void {
    this._clock = this.customClock ?? clock;
    if (this._clock !== null)
      this._scheduler?.updateClock(this._clock);
  }

  /** Whether customClock should be automatically invoked on this Drawable's updateSubTree(). */
  processCustomClock = true;

  private _lifetimeStart = MIN_VALUE;
  private _lifetimeEnd = MAX_VALUE;

  /** @internal Invoked after lifetimeStart or lifetimeEnd has changed. */
  readonly lifetimeChanged = new Signal<Drawable>();

  /** The time at which this drawable becomes valid (and is considered for drawing). */
  get lifetimeStart(): number {
    return this._lifetimeStart;
  }

  set lifetimeStart(value: number) {
    if (this._lifetimeStart === value) return;

    this._lifetimeStart = value;
    this.lifetimeChanged.emit(this);
  }

  /** The time at which this drawable is no longer valid (and is considered for disposal). */
  get lifetimeEnd(): number {
    return this._lifetimeEnd;
  }

  set lifetimeEnd(value: number) {
    if (this._lifetimeEnd === value) return;

    this._lifetimeEnd = value;
    this.lifetimeChanged.emit(this);
  }

  /** @internal Whether this drawable should currently be alive. This is queried by the framework to decide the IsAlive state of this drawable for the next frame. */
  get shouldBeAlive(): boolean {
    if (this.lifetimeStart === MIN_VALUE && this.lifetimeEnd === MAX_VALUE)
      return true;

    return this.timeCurrent >= this.lifetimeStart && this.timeCurrent < this.lifetimeEnd;
  }

  /** Whether to remove the drawable from its parent's children when it's not alive. */
  get removeWhenNotAlive(): boolean {
    return this._parent === null || this.timeCurrent > this.lifetimeStart;
  }

  // #endregion

  // #region Parenting (scene graph operations, including ProxyDrawable)

  /** Find the closest parent of a specified type (DrawableExtensions.FindClosestParent). */
  findClosestParent<T>(type: Function & { prototype: T }): T | null {
    let p: Drawable | null = this._parent;

    while (p !== null) {
      if (p instanceof type)
        return p as T;

      p = p._parent;
    }

    return null;
  }

  private _parent: CompositeDrawable | null = null;

  /** The parent of this drawable in the scene graph. */
  get parent(): CompositeDrawable | null {
    return this._parent;
  }

  /** @internal */
  set parent(value: CompositeDrawable | null) {
    if (this._isDisposed)
      throw new Error(`Disposed Drawables may never get a parent and return to the scene graph. (${this})`);

    if (value === null)
      this.childID = 0;

    if (this._parent === value) return;

    if (value !== null && this._parent !== null)
      throw new Error('May not add a drawable to multiple containers.');

    this._parent = value;
    this.invalidate(this.invalidationFromParentSize | Invalidation.Colour | Invalidation.Presence | Invalidation.Parent);

    if (this._parent !== null) {
      //we should already have a clock at this point (from our LoadRequested invocation)
      //this just ensures we have the most recent parent clock.
      //we may want to consider enforcing that parent.Clock == clock here.
      this.updateClock(this._parent.clock);
    }
  }

  /** @internal Refers to the original if this drawable was created via createProxy(). */
  get original(): Drawable {
    return this;
  }

  /** True iff createProxy() has been called before. */
  get hasProxy(): boolean {
    return this.proxy !== null;
  }

  /** True iff this Drawable is a proxy of another one. */
  get isProxy(): boolean {
    return this.original !== this;
  }

  /** @internal */ proxy: Drawable | null = null;

  /** Creates a proxy drawable which can be inserted elsewhere in the scene graph. Will cause the original instance to not render itself. */
  createProxy(): Drawable {
    if (this.proxy !== null)
      throw new Error('Multiple proxies are not supported.');

    return this.proxy = Drawable.proxyFactory!(this);
  }

  /** @internal Set by ProxyDrawable.ts to avoid an import cycle. */
  static proxyFactory: ((original: Drawable) => Drawable) | null = null;

  /** @internal The DOM "draw frame": incremented once per root validateElementSubTree(). */
  static elementFrame = 0;

  /** @internal Set by ProxyDrawable.ts: shows/positions proxied elements after the root element walk. */
  static flushProxies: (() => void) | null = null;

  /** @internal Marks this drawable's element as drawn this frame for its proxy (ValidateProxyDrawNode). */
  validateProxyDrawNode(): void {
    this.proxy!.validateProxyDrawNode();
  }

  // #endregion

  // #region Caching & invalidation (for things too expensive to compute every frame)

  /** Was this Drawable masked away completely during the last frame? This is measured conservatively based on the inequality of bounding boxes. */
  isMaskedAway = false;

  private readonly maskingBacking = new LayoutValueOf<boolean>(Invalidation.DrawInfo | Invalidation.RequiredParentSizeToFit | Invalidation.Presence);

  private readonly screenSpaceDrawQuadBacking = new LayoutValueOf<Quad>(Invalidation.DrawInfo | Invalidation.RequiredParentSizeToFit | Invalidation.Presence);

  protected computeScreenSpaceDrawQuad(): Quad {
    return this.toScreenSpaceRect(this.drawRectangle);
  }

  /** The screen-space quad this drawable occupies. */
  get screenSpaceDrawQuad(): Quad {
    return this.screenSpaceDrawQuadBacking.isValid ? this.screenSpaceDrawQuadBacking.value : (this.screenSpaceDrawQuadBacking.value = this.computeScreenSpaceDrawQuad());
  }

  private readonly drawInfoBacking = new LayoutValueOf<DrawInfo>(Invalidation.DrawInfo | Invalidation.RequiredParentSizeToFit | Invalidation.Presence);

  /** The local part of DrawInfo (parent's DrawRectangle space -> ours), as written to the element. */
  private localDrawInfo = new DrawInfo();

  private computeDrawInfo(): DrawInfo {
    const di = this._parent?.drawInfo.clone() ?? new DrawInfo();

    let pos = this.drawPosition.add(this.anchorPosition);
    const drawScale = this.drawScale;

    if (this._parent !== null)
      pos = pos.add(this._parent.childOffset);

    di.applyTransform(pos, drawScale, this.rotation, this.shear, this.originPosition);

    const local = new DrawInfo();
    local.applyTransform(pos, drawScale, this.rotation, this.shear, this.originPosition);
    this.localDrawInfo = local;

    return di;
  }

  /** Contains the linear transformation of this Drawable that is used during draw. */
  get drawInfo(): DrawInfo {
    return this.drawInfoBacking.isValid ? this.drawInfoBacking.value : (this.drawInfoBacking.value = this.computeDrawInfo());
  }

  private readonly drawColourInfoBacking: LayoutValueOf<DrawColourInfo> = new LayoutValueOf<DrawColourInfo>(
    Invalidation.Colour | Invalidation.DrawInfo | Invalidation.RequiredParentSizeToFit | Invalidation.Presence,
    InvalidationSource.Default,
    (s, i): boolean => {
      if ((i & Invalidation.Colour) > 0)
        return true;

      return !s.colour.hasSingleColour || (s.drawColourInfoBacking.isValid && !s.drawColourInfoBacking.value.colour.hasSingleColour);
    });

  /** Contains the colour and blending information of this Drawable that are used during draw. */
  get drawColourInfo(): DrawColourInfo {
    return this.drawColourInfoBacking.isValid ? this.drawColourInfoBacking.value : (this.drawColourInfoBacking.value = this.computeDrawColourInfo());
  }

  private computeDrawColourInfo(): DrawColourInfo {
    const ci = this._parent?.drawColourInfo ?? new DrawColourInfo();

    let localBlending = this.blending;

    if (this._parent !== null && localBlending === BlendingParameters.Inherit)
      localBlending = ci.blending;

    if (localBlending === BlendingParameters.Inherit)
      localBlending = BlendingParameters.Mixture;

    const ourColour = this._alpha !== 1 ? this._colour.multiplyAlpha(this._alpha) : this._colour;

    let colour: ColourInfo;

    if (ci.colour.hasSingleColour)
      colour = ci.colour.applyChild(ourColour);
    else {
      // Cannot use ToParentSpace here, because ToParentSpace depends on DrawInfo to be completed
      const interp = Quad.fromRectangle(this.drawRectangle).mul(this.drawInfo.matrix.multiply(this._parent!.drawInfo.matrixInverse));
      const parentSize = this._parent!.drawSize;

      const rel = (v: Vector2): [number, number] => [v.x / parentSize.x, v.y / parentSize.y];

      colour = ci.colour.applyChild(ourColour, {
        topLeft: rel(interp.topLeft),
        topRight: rel(interp.topRight),
        bottomLeft: rel(interp.bottomLeft),
        bottomRight: rel(interp.bottomRight),
      });
    }

    return new DrawColourInfo(colour, localBlending);
  }

  private readonly requiredParentSizeToFitBacking = new LayoutValueOf<Vector2>(Invalidation.RequiredParentSizeToFit);

  private computeRequiredParentSizeToFit(): Vector2 {
    // Auxiliary variables required for the computation
    const ap = this.anchorPosition;
    const rap = this.relativeAnchorPosition;

    const ratio1 = new Vector2(
      rap.x <= 0 ? 0 : 1 / rap.x,
      rap.y <= 0 ? 0 : 1 / rap.y);

    const ratio2 = new Vector2(
      rap.x >= 1 ? 0 : 1 / (1 - rap.x),
      rap.y >= 1 ? 0 : 1 / (1 - rap.y));

    const bbox = this.boundingBox;

    // Compute the required size of the parent such that we fit in snugly when positioned
    // at our relative anchor in the parent.
    const topLeftOffset = ap.sub(bbox.topLeft);
    const topLeftSize1 = topLeftOffset.mul(ratio1);
    const topLeftSize2 = topLeftOffset.neg().mul(ratio2);

    const bottomRightOffset = ap.sub(bbox.bottomRight);
    const bottomRightSize1 = bottomRightOffset.mul(ratio1);
    const bottomRightSize2 = bottomRightOffset.neg().mul(ratio2);

    // Expand bounds according to clipped offset
    return Vector2.componentMax(
      Vector2.componentMax(topLeftSize1, topLeftSize2),
      Vector2.componentMax(bottomRightSize1, bottomRightSize2));
  }

  /** @internal Returns the size of the smallest axis aligned box in parent space which encompasses this drawable while preserving this draw position. */
  get requiredParentSizeToFit(): Vector2 {
    return this.requiredParentSizeToFitBacking.isValid
      ? this.requiredParentSizeToFitBacking.value
      : (this.requiredParentSizeToFitBacking.value = this.computeRequiredParentSizeToFit());
  }

  private readonly invalidationList = new InvalidationList(Invalidation.All);

  private layoutList: LayoutMember | null = null;

  /** Adds a layout member that will be invalidated when its invalidation conditions are met. Must be called in the constructor. */
  protected addLayout(member: LayoutMember): void {
    if (this._loadState > LoadState.NotLoaded)
      throw new Error('LayoutMembers cannot be added after Drawables have started loading. Consider adding in the constructor.');

    if (this.layoutList === null)
      this.layoutList = member;
    else {
      member.next = this.layoutList;
      this.layoutList = member;
    }

    member.parent = this;
  }

  /** @internal Validates the super-tree of this Drawable for the given invalidation type. */
  validateSuperTree(validationType: Invalidation): void {
    if (this.invalidationList.validate(validationType))
      this._parent?.validateSuperTree(validationType);
  }

  // Make sure we start out with a value of 1 such that ApplyDrawNode is always called at least once
  invalidationID = 1;

  /** Invalidates the layout of this Drawable. Returns whether the invalidation was handled. */
  invalidate(invalidation = Invalidation.All, source = InvalidationSource.Self): boolean {
    return this.invalidateInternal(invalidation, source);
  }

  private invalidateInternal(invalidation = Invalidation.All, source = InvalidationSource.Self, propagateToParent = true): boolean {
    if (source !== InvalidationSource.Child && source !== InvalidationSource.Parent && source !== InvalidationSource.Self)
      throw new Error('A Drawable can only be invalidated with a singular source (child, parent, or self).');

    if (this._loadState < LoadState.Ready)
      return false;

    // Changes in the colour of children don't affect parents.
    if (source === InvalidationSource.Child)
      invalidation &= ~Invalidation.Colour;

    if (invalidation === Invalidation.None)
      return false;

    // If the invalidation originated locally, propagate to the immediate parent.
    // Note: This is done _before_ invalidation is blocked below, since the parent always needs to be aware of changes even if the Drawable's invalidation state hasn't changed.
    // This is for only propagating once, otherwise it would propagate all the way to the root Drawable.
    if (propagateToParent && source === InvalidationSource.Self)
      this._parent?.invalidate(invalidation, InvalidationSource.Child);

    // Perform the invalidation.
    if (!this.invalidationList.invalidate(source, invalidation))
      return false;

    // A DrawNode invalidation always invalidates.
    let anyInvalidated = (invalidation & Invalidation.DrawNode) > 0;

    // Invalidate all layout members
    let nextLayout = this.layoutList;

    while (nextLayout !== null) {
      // Only invalidate layout members that accept the given source.
      // Remove invalidation flags that don't refer to the layout member.
      const memberInvalidation = invalidation & nextLayout.invalidation;

      if ((nextLayout.source & source) !== 0 && memberInvalidation !== 0) {
        if (nextLayout.conditions?.(this, memberInvalidation) !== false)
          anyInvalidated = nextLayout.invalidate() || anyInvalidated;
      }

      nextLayout = nextLayout.next;
    }

    // Allow any custom invalidation to take place.
    anyInvalidated = this.onInvalidate(invalidation, source) || anyInvalidated;

    if (anyInvalidated)
      this.invalidationID++;

    this.invalidated.emit([this, invalidation]);

    return anyInvalidated;
  }

  /** Invoked when this Drawable becomes invalidated. Returns whether any internal state was invalidated. */
  protected onInvalidate(_invalidation: Invalidation, _source: InvalidationSource): boolean {
    return false;
  }

  /** A fast path for invalidating ourselves and our parent's children size dependencies whenever a size or position change occurs. */
  get invalidationFromParentSize(): Invalidation {
    let result = Invalidation.DrawInfo;
    if (this.relativeSizeAxes !== Axes.None)
      result |= Invalidation.DrawSize;
    if (this.relativePositionAxes !== Axes.None)
      result |= Invalidation.MiscGeometry;
    return result;
  }

  private invalidateParentSizeDependencies(invalidation: Invalidation, changedAxes: Axes): void {
    // We're invalidating the parent manually, so we should not propagate it upwards.
    this.invalidateInternal(invalidation, InvalidationSource.Self, false);

    // The fast path, which performs an invalidation on the parent along with optimisations for bypassed sizing axes.
    this._parent?.invalidateChildrenSizeDependencies(invalidation, changedAxes, this);
  }

  // #endregion

  // #region DrawNode (DOM)

  private appliedInvalidationID = 0;

  /** @internal Equivalent of GenerateDrawNodeSubtree for one drawable: re-applies element state if this drawable was invalidated. */
  validateElement(): void {
    if (this.invalidationID !== this.appliedInvalidationID) {
      this.appliedInvalidationID = this.invalidationID;
      this.applyElementState();
    }
  }

  private lastTransformCss = '';
  private lastLeft = NaN;
  private lastTop = NaN;
  private lastWidth = NaN;
  private lastHeight = NaN;
  private lastBlendMode = '';

  /**
   * Writes this drawable's state to its element (DrawNode.ApplyState). Override to write leaf-specific styles,
   * always calling super. Uses left/top for pure translations so that only rotated/scaled/sheared drawables create a
   * CSS stacking context (which would otherwise isolate mix-blend-mode of descendants).
   */
  protected applyElementState(): void {
    const style = this.element.style;

    void this.drawInfo; // ensures localDrawInfo is current
    const m = this.localDrawInfo.matrix;

    const isTranslationOnly = m.m11 === 1 && m.m12 === 0 && m.m21 === 0 && m.m22 === 1;

    const left = isTranslationOnly ? m.m31 : 0;
    const top = isTranslationOnly ? m.m32 : 0;
    const transformCss = isTranslationOnly ? '' : m.toCss();

    if (!this.hasProxy)
      this.writeElementPosition(left, top, transformCss);

    const size = this.drawSize;
    if (size.x !== this.lastWidth) style.width = `${this.lastWidth = size.x}px`;
    if (size.y !== this.lastHeight) style.height = `${this.lastHeight = size.y}px`;

    const blendMode = this.blending === BlendingParameters.Additive ? 'plus-lighter' : this.blending === BlendingParameters.Inherit ? '' : 'normal';
    if (blendMode !== this.lastBlendMode) style.mixBlendMode = this.lastBlendMode = blendMode;
  }

  private writeElementPosition(left: number, top: number, transformCss: string): void {
    const style = this.element.style;
    if (left !== this.lastLeft) style.left = `${this.lastLeft = left}px`;
    if (top !== this.lastTop) style.top = `${this.lastTop = top}px`;
    if (transformCss !== this.lastTransformCss) style.transform = this.lastTransformCss = transformCss;
  }

  /** @internal Positions this (proxied) drawable's element inside its proxy's element: our DrawInfo in the proxy's space. */
  applyProxiedElementPosition(proxy: Drawable): void {
    this.writeElementPosition(0, 0, this.drawInfo.matrix.multiply(proxy.drawInfo.matrixInverse).toCss());
  }

  // #endregion

  // #region DrawInfo-based coordinate system conversions

  /** Accepts a vector in local coordinates and converts it to coordinates in another Drawable's space. */
  toSpaceOfOtherDrawable(input: Vector2, other: Drawable): Vector2 {
    if (other === this)
      return input;

    return other.drawInfo.matrixInverse.transform(this.drawInfo.matrix.transform(input));
  }

  /** Accepts a rectangle in local coordinates and converts it to a quad in another Drawable's space. */
  toSpaceOfOtherDrawableRect(input: RectangleF, other: Drawable): Quad {
    if (other === this)
      return Quad.fromRectangle(input);

    return Quad.fromRectangle(input).mul(this.drawInfo.matrix.multiply(other.drawInfo.matrixInverse));
  }

  /** Accepts a vector in local coordinates and converts it to coordinates in Parent's space. */
  toParentSpace(input: Vector2): Vector2 {
    return this.toSpaceOfOtherDrawable(input, this._parent!);
  }

  /** Accepts a rectangle in local coordinates and converts it to a quad in Parent's space. */
  toParentSpaceRect(input: RectangleF): Quad {
    return this.toSpaceOfOtherDrawableRect(input, this._parent!);
  }

  /** Accepts a vector in local coordinates and converts it to coordinates in screen space. */
  toScreenSpace(input: Vector2): Vector2 {
    return this.drawInfo.matrix.transform(input);
  }

  /** Accepts a rectangle in local coordinates and converts it to a quad in screen space. */
  toScreenSpaceRect(input: RectangleF): Quad {
    return Quad.fromRectangle(input).mul(this.drawInfo.matrix);
  }

  /** Accepts a vector in screen coordinates and converts it to coordinates in local space. */
  toLocalSpace(screenSpacePos: Vector2): Vector2 {
    return this.drawInfo.matrixInverse.transform(screenSpacePos);
  }

  /** Accepts a quad in screen coordinates and converts it to coordinates in local space. */
  toLocalSpaceQuad(screenSpaceQuad: Quad): Quad {
    return screenSpaceQuad.mul(this.drawInfo.matrixInverse);
  }

  // #endregion

  // #region Interaction / Input

  /** Handle a UI event. Default implementation for all event handlers. Returns true if this drawable handled the event (blocks propagation). */
  protected handle(_e: UIEvent): boolean {
    return false;
  }

  /** Trigger a UI event with target set to this Drawable. Returns the result of the event handler. */
  triggerEvent(e: UIEvent): boolean {
    e.target = this;

    if (e instanceof MouseMoveEvent) return this.onMouseMove(e);
    if (e instanceof HoverEvent) return this.onHover(e);
    if (e instanceof HoverLostEvent) {
      this.onHoverLost(e);
      return false;
    }
    if (e instanceof MouseDownEvent) return this.onMouseDown(e);
    if (e instanceof MouseUpEvent) {
      this.onMouseUp(e);
      return false;
    }
    if (e instanceof ClickEvent) return this.onClick(e);
    if (e instanceof DoubleClickEvent) return this.onDoubleClick(e);
    if (e instanceof DragStartEvent) return this.onDragStart(e);
    if (e instanceof DragEvent) {
      this.onDrag(e);
      return false;
    }
    if (e instanceof DragEndEvent) {
      this.onDragEnd(e);
      return false;
    }
    if (e instanceof ScrollEvent) return this.onScroll(e);
    if (e instanceof FocusEvent) {
      this.onFocus(e);
      return false;
    }
    if (e instanceof FocusLostEvent) {
      this.onFocusLost(e);
      return false;
    }
    if (e instanceof KeyDownEvent) return this.onKeyDown(e);
    if (e instanceof KeyUpEvent) {
      this.onKeyUp(e);
      return false;
    }

    return this.handle(e);
  }

  /** Triggers a left click event for this Drawable. */
  triggerClick(): boolean {
    return this.triggerEvent(new ClickEvent(this.getContainingInputManager()?.currentState ?? new InputState(), MouseButton.Left));
  }

  /** Retrieve the first parent in the tree which derives from InputManager. As this is performing an upward tree traversal, avoid calling every frame. */
  getContainingInputManager(): InputManager | null {
    return Drawable.containingInputManagerResolver?.(this) ?? null;
  }

  /** Retrieve the first parent in the tree which implements IFocusManager. As this is performing an upward tree traversal, avoid calling every frame. */
  getContainingFocusManager(): IFocusManager | null {
    let p: Drawable | null = this._parent;

    while (p !== null) {
      if (isFocusManager(p))
        return p;

      p = p._parent;
    }

    return null;
  }

  /** @internal Set by InputManager.ts to resolve the containing input manager without an import cycle. */
  static containingInputManagerResolver: ((d: Drawable) => InputManager | null) | null = null;

  // #region Individual event handlers

  /** An event that occurs every time the mouse is moved while hovering this Drawable. */
  protected onMouseMove(e: MouseMoveEvent): boolean { return this.handle(e); }

  /** An event that occurs when the mouse starts hovering this Drawable. */
  protected onHover(e: HoverEvent): boolean { return this.handle(e); }

  /** An event that occurs when the mouse stops hovering this Drawable. */
  protected onHoverLost(e: HoverLostEvent): void { this.handle(e); }

  /** An event that occurs when a MouseButton is pressed on this Drawable. */
  protected onMouseDown(e: MouseDownEvent): boolean { return this.handle(e); }

  /** An event that occurs when a MouseButton that was pressed on this Drawable is released. */
  protected onMouseUp(e: MouseUpEvent): void { this.handle(e); }

  /** An event that occurs when a MouseButton is clicked on this Drawable (pressed and released with the mouse inside). */
  protected onClick(e: ClickEvent): boolean { return this.handle(e); }

  /** An event that occurs when a MouseButton is double-clicked on this Drawable. */
  protected onDoubleClick(e: DoubleClickEvent): boolean { return this.handle(e); }

  /** An event that occurs when the mouse starts dragging on this Drawable. Return true to become the dragged drawable. */
  protected onDragStart(e: DragStartEvent): boolean { return this.handle(e); }

  /** An event that occurs every time the mouse moves while dragging this Drawable. */
  protected onDrag(e: DragEvent): void { this.handle(e); }

  /** An event that occurs when the mouse button that started a drag is released. */
  protected onDragEnd(e: DragEndEvent): void { this.handle(e); }

  /** An event that occurs when the mouse wheel is scrolled on this Drawable. */
  protected onScroll(e: ScrollEvent): boolean { return this.handle(e); }

  /** An event that occurs when this Drawable gains focus. */
  protected onFocus(e: FocusEvent): void { this.handle(e); }

  /** An event that occurs when this Drawable loses focus. */
  protected onFocusLost(e: FocusLostEvent): void { this.handle(e); }

  /** An event that occurs when a Key is pressed. */
  protected onKeyDown(e: KeyDownEvent): boolean { return this.handle(e); }

  /** An event that occurs when a Key is released. */
  protected onKeyUp(e: KeyUpEvent): void { this.handle(e); }

  // #endregion

  /** @internal Whether this drawable has overridden any non-positional input handler (Drawable.HandleInputCache). */
  requestsNonPositionalInput = false;

  /** @internal Whether this drawable has overridden any positional input handler (Drawable.HandleInputCache). */
  requestsPositionalInput = false;

  /** @internal Conservatively approximates whether there is a descendant which requestsNonPositionalInput. */
  requestsNonPositionalInputSubTree = false;

  /** @internal Conservatively approximates whether there is a descendant which requestsPositionalInput. */
  requestsPositionalInputSubTree = false;

  /** Whether this drawable should receive non-positional input. This does not mean that the drawable will immediately handle the received input, but that it may handle it at some point. */
  get handleNonPositionalInput(): boolean {
    return this.requestsNonPositionalInput;
  }

  /** Whether this drawable should receive positional input. This does not mean that the drawable will immediately handle the received input, but that it may handle it at some point. */
  get handlePositionalInput(): boolean {
    return this.requestsPositionalInput;
  }

  /** Whether this Drawable is currently focused. */
  hasFocus = false;

  /** If true, we are eagerly requesting focus. If nothing else above us has (or is requesting focus) we will get it. */
  get requestsFocus(): boolean {
    return false;
  }

  /** If true, we will gain focus (receiving priority on keyboard input) (and receive an onFocus event) on returning true in onClick. */
  get acceptsFocus(): boolean {
    return false;
  }

  /** Whether this Drawable can be clicked to change focus (when focused elsewhere). */
  get changeFocusOnClick(): boolean {
    return true;
  }

  /** Whether this Drawable is currently hovered over. This is updated only if handlePositionalInput is true. */
  isHovered = false;

  /** Whether this Drawable is currently being dragged. */
  isDragged = false;

  /** Determines whether this drawable receives positional input when the mouse is at the given screen-space position. */
  receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    return this.contains(screenSpacePos);
  }

  /** Computes whether a given screen-space position is contained within this drawable. Mouse input events are only received when this function is true, or when the drawable is in focus. */
  contains(screenSpacePos: Vector2): boolean {
    return this.drawRectangle.contains(this.toLocalSpace(screenSpacePos));
  }

  /** Whether non-positional input should be propagated to the sub-tree rooted at this drawable. */
  get propagateNonPositionalInputSubTree(): boolean {
    return this.isPresent && this.requestsNonPositionalInputSubTree;
  }

  /** Whether positional input should be propagated to the sub-tree rooted at this drawable. */
  get propagatePositionalInputSubTree(): boolean {
    return this.isPresent && this.requestsPositionalInputSubTree && !this.isMaskedAway;
  }

  /** Whether clicks should be blocked when this drawable is in a dragged state. */
  get dragBlocksClick(): boolean {
    return true;
  }

  /** @internal Builds the non-positional input queue (back to front). Returns false if we shouldn't propagate further. */
  buildNonPositionalInputQueue(queue: Drawable[], _allowBlocking = true): boolean {
    if (!this.propagateNonPositionalInputSubTree)
      return false;

    if (this.handleNonPositionalInput)
      queue.push(this);

    return true;
  }

  /** @internal Builds the positional input queue (back to front) at the given screen space position. Returns false if we shouldn't propagate further. */
  buildPositionalInputQueue(screenSpacePos: Vector2, queue: Drawable[]): boolean {
    if (!this.propagatePositionalInputSubTree)
      return false;

    if (this.handlePositionalInput && this.receivePositionalInputAt(screenSpacePos))
      queue.push(this);

    return true;
  }

  // #endregion

  // #region Transforms

  /** Schedules a task to be run on the next update (or after transformDelay, when inside a delayed sequence). */
  schedule(action: () => void): ScheduledDelegate {
    if (this.transformDelay > 0)
      return this.scheduler.addDelayed(action, this.transformDelay);

    return this.scheduler.add(action)!;
  }

  /** Make this drawable automatically clean itself up after all transforms have finished playing. Can be delayed using delay(). */
  expire(calculateLifetimeStart = false): void {
    if (this._clock === null) {
      this.lifetimeEnd = MIN_VALUE;
      return;
    }

    this.lifetimeEnd = this.latestTransformEndTime;

    if (calculateLifetimeStart) {
      let min = MAX_VALUE;

      for (const t of this.transforms) {
        if (t.startTime < min)
          min = t.startTime;
      }

      this.lifetimeStart = min < 2147483647 ? min : -2147483648;
    }
  }

  /** Hide sprite instantly. */
  hide(): void {
    this.fadeOut();
  }

  /** Show sprite instantly. */
  show(): void {
    this.fadeIn();
  }

  // ---- TransformableExtensions (Drawable part) ----

  /** Rotate over one full rotation with provided parameters (forever, or numRevolutions times). */
  spin(revolutionDuration: number, direction: RotationDirection, startRotation = 0, numRevolutions?: number): TransformSequence<this> {
    return this.delay(0).spin(revolutionDuration, direction, startRotation, numRevolutions);
  }

  /** Smoothly adjusts Alpha to 1 over time. */
  fadeIn(duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.fadeTo(1, duration, easing);
  }

  /** Smoothly adjusts Alpha from 0 to 1 over time. */
  fadeInFromZero(duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.fadeTo(0).fadeIn(duration, easing);
  }

  /** Smoothly adjusts Alpha to 0 over time. */
  fadeOut(duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.fadeTo(0, duration, easing);
  }

  /** Smoothly adjusts Alpha from 1 to 0 over time. */
  fadeOutFromOne(duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.fadeTo(1).fadeOut(duration, easing);
  }

  /** Smoothly adjusts Alpha over time. */
  fadeTo(newAlpha: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('alpha', newAlpha, duration, easing);
  }

  /** Smoothly adjusts Colour over time. */
  fadeColour(newColour: ColourLike, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('colour', ColourInfo.from(newColour), duration, easing);
  }

  /** Instantaneously flashes Colour, then smoothly changes it back over time. */
  flashColour(flashColour: ColourLike, duration: number, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    const last = [...this.transforms].reverse().find(t => t.targetMember === 'colour') as Transform<ColourInfo> | undefined;
    const endValue = last?.endValue ?? this.colour;

    return this.fadeColour(flashColour).fadeColour(endValue, duration, easing);
  }

  /** Smoothly adjusts Rotation over time. */
  rotateTo(newRotation: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('rotation', newRotation, duration, easing);
  }

  /** Smoothly adjusts Scale over time. */
  scaleTo(newScale: number | Vector2, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('scale', typeof newScale === 'number' ? new Vector2(newScale) : newScale, duration, easing);
  }

  /** Smoothly adjusts Size over time. */
  resizeTo(newSize: number | Vector2, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('size', typeof newSize === 'number' ? new Vector2(newSize) : newSize, duration, easing);
  }

  /** Smoothly adjusts Width over time. */
  resizeWidthTo(newWidth: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('width', newWidth, duration, easing, 'size');
  }

  /** Smoothly adjusts Height over time. */
  resizeHeightTo(newHeight: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('height', newHeight, duration, easing, 'size');
  }

  /** Smoothly adjusts Position over time. */
  moveTo(newPosition: Vector2, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('position', newPosition, duration, easing);
  }

  /** Smoothly adjusts X over time. */
  moveToX(destination: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('x', destination, duration, easing, 'position');
  }

  /** Smoothly adjusts Y over time. */
  moveToY(destination: number, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.transformTo('y', destination, duration, easing, 'position');
  }

  /** Smoothly adjusts Position by an offset to its final value over time. */
  moveToOffset(offset: Vector2, duration = 0, easing: Easing | IEasingFunction = Easing.None): TransformSequence<this> {
    return this.applyTransform(this.populateTransform(new PositionOffsetTransform(offset), Vector2.Zero, duration, easing));
  }

  // #endregion

  /** A name used for debugging. */
  name = '';

  /**
   * C# object-initializer equivalent: assigns the given members in order (setters run, as in C#) and returns this.
   * e.g. `new Box().with({ relativeSizeAxes: Axes.Both, colour: Colour4.Black })`.
   */
  with(props: DrawableInit<this>): this {
    Object.assign(this, props);
    return this;
  }

  override toString(): string {
    const shortClass = this.constructor.name;

    if (this.name)
      return `${this.name}(${shortClass})`;

    return shortClass;
  }
}

// TransformSequenceExtensions: the same helpers, appended to a sequence.
type EasingArg = Easing | IEasingFunction;

declare module '../transforms/TransformSequence' {
  interface TransformSequence<T extends Transformable> {
    fadeIn(duration?: number, easing?: EasingArg): TransformSequence<T>;
    fadeInFromZero(duration?: number, easing?: EasingArg): TransformSequence<T>;
    fadeOut(duration?: number, easing?: EasingArg): TransformSequence<T>;
    fadeOutFromOne(duration?: number, easing?: EasingArg): TransformSequence<T>;
    fadeTo(newAlpha: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    fadeColour(newColour: ColourLike, duration?: number, easing?: EasingArg): TransformSequence<T>;
    flashColour(flashColour: ColourLike, duration: number, easing?: EasingArg): TransformSequence<T>;
    rotateTo(newRotation: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    scaleTo(newScale: number | Vector2, duration?: number, easing?: EasingArg): TransformSequence<T>;
    resizeTo(newSize: number | Vector2, duration?: number, easing?: EasingArg): TransformSequence<T>;
    resizeWidthTo(newWidth: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    resizeHeightTo(newHeight: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    moveTo(newPosition: Vector2, duration?: number, easing?: EasingArg): TransformSequence<T>;
    moveToX(destination: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    moveToY(destination: number, duration?: number, easing?: EasingArg): TransformSequence<T>;
    moveToOffset(offset: Vector2, duration?: number, easing?: EasingArg): TransformSequence<T>;
    expire(calculateLifetimeStart?: boolean): TransformSequence<T>;
    schedule(scheduledAction: () => void): TransformSequence<T>;
    spin(revolutionDuration: number, direction: RotationDirection, startRotation?: number, numRevolutions?: number): TransformSequence<T>;
  }
}

const sequenceHelperNames = ['fadeIn', 'fadeInFromZero', 'fadeOut', 'fadeOutFromOne', 'fadeTo', 'fadeColour', 'flashColour', 'rotateTo', 'scaleTo',
  'resizeTo', 'resizeWidthTo', 'resizeHeightTo', 'moveTo', 'moveToX', 'moveToY', 'moveToOffset', 'expire', 'schedule'] as const;

/** Installs the TransformSequenceExtensions methods: each appends the Drawable helper of the same name to the sequence. */
for (const name of sequenceHelperNames) {
  Object.defineProperty(TransformSequence.prototype, name, {
    configurable: true,
    writable: true,
    value(this: TransformSequence<Drawable>, ...args: unknown[]) {
      return this.append(o => (o[name] as (...a: unknown[]) => TransformSequence<Drawable>)(...args));
    },
  });
}

Object.defineProperty(TransformSequence.prototype, 'spin', {
  configurable: true,
  writable: true,
  value(this: TransformSequence<Drawable>, revolutionDuration: number, direction: RotationDirection, startRotation = 0, numRevolutions?: number) {
    const gen = (d: Drawable) => d.rotateTo(startRotation).rotateTo(startRotation + (direction === RotationDirection.Clockwise ? 360 : -360), revolutionDuration);
    return numRevolutions === undefined ? this.loop(gen) : this.loop(0, numRevolutions, gen);
  },
});

/** Ported from TransformableExtensions.PositionOffsetTransform */
class PositionOffsetTransform extends Transform<Vector2, Drawable> {
  constructor(private readonly offset: Vector2) {
    super();
  }

  override get targetMember(): string {
    return 'position';
  }

  private positionAt(time: number): Vector2 {
    if (time < this.startTime) return this.startValue;
    if (time >= this.endTime) return this.endValue;

    return valueAt(time, this.startValue, this.endValue, this.startTime, this.endTime, this.easing);
  }

  protected override applyTo(d: Drawable, time: number): void {
    d.position = this.positionAt(time);
  }

  protected override readIntoStartValueFrom(d: Drawable): void {
    this.startValue = d.position;
    this.endValue = d.position.add(this.offset);
  }
}

/** Ported from osu.Framework/Graphics/Drawable.HandleInputCache.cs: C# reflects over overridden methods; here we walk the prototype chain. */
const HandleInputCache = {
  positionalInputMethods: ['handle', 'onMouseMove', 'onHover', 'onHoverLost', 'onMouseDown', 'onMouseUp', 'onClick', 'onDoubleClick',
    'onDragStart', 'onDrag', 'onDragEnd', 'onScroll', 'onFocus', 'onFocusLost'],
  nonPositionalInputMethods: ['handle', 'onFocus', 'onFocusLost', 'onKeyDown', 'onKeyUp'],
  positionalInputProperties: ['handlePositionalInput'],
  nonPositionalInputProperties: ['handleNonPositionalInput', 'acceptsFocus'],
  // IHasTooltip, IHasCustomTooltip, IHasContextMenu, IHasPopover (duck-typed members)
  positionalInputInterfaceMembers: ['tooltipText', 'getCustomTooltip', 'contextMenuItems', 'getPopover'],
  // IKeyBindingHandler
  nonPositionalInputInterfaceMembers: ['onPressed'],

  cache: new Map<Function, [boolean, boolean]>(),

  overrides(d: Drawable, name: string): boolean {
    for (let proto = Object.getPrototypeOf(d); proto !== null && proto !== Drawable.prototype; proto = Object.getPrototypeOf(proto)) {
      if (Object.prototype.hasOwnProperty.call(proto, name))
        return true;
    }

    return false;
  },

  compute(d: Drawable): [boolean, boolean] {
    const ctor = d.constructor;
    let v = this.cache.get(ctor);

    if (v === undefined) {
      const positional = this.positionalInputMethods.some(m => this.overrides(d, m))
        || this.positionalInputProperties.some(m => this.overrides(d, m))
        || this.positionalInputInterfaceMembers.some(m => m in d)
        || (d as { requireHighFrequencyMousePosition?: boolean }).requireHighFrequencyMousePosition === true;

      const nonPositional = this.nonPositionalInputMethods.some(m => this.overrides(d, m))
        || this.nonPositionalInputProperties.some(m => this.overrides(d, m))
        || this.nonPositionalInputInterfaceMembers.some(m => m in d);

      this.cache.set(ctor, v = [positional, nonPositional]);
    }

    return v;
  },

  requestsPositionalInput(d: Drawable): boolean {
    return this.compute(d)[0];
  },

  requestsNonPositionalInput(d: Drawable): boolean {
    return this.compute(d)[1];
  },
};
