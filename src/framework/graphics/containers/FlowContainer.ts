// Ported from osu.Framework/Graphics/Containers/FlowContainer.cs

import { Axes, Invalidation } from '../../layout/Enums';
import { InvalidationSource, LayoutValue } from '../../layout/Layout';
import { Precision } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import { Easing } from '../../transforms/Easing';
import { TransformCustom } from '../../transforms/TransformCustom';
import type { Drawable } from '../Drawable';
import { Container } from './Container';

/** A basic container that positions its children in a flow; positions are computed by computeLayoutPositions. */
export abstract class FlowContainer<T extends Drawable = Drawable> extends Container<T> {
  /** @internal */ onLayout: (() => void) | null = null;

  constructor() {
    super();

    this.addLayout(this.layout);
    this.addLayout(this.childLayout);
  }

  /** The easing that should be used when children are moved to their position in the layout. */
  get layoutEasing(): Easing {
    return this.autoSizeEasing;
  }

  set layoutEasing(value: Easing) {
    this.autoSizeEasing = value;
  }

  /** The time it should take to move a child from its current position to its new layout position (autosize takes half). */
  get layoutDuration(): number {
    return this.autoSizeDuration * 2;
  }

  set layoutDuration(value: number) {
    this.autoSizeDuration = value / 2;
  }

  private _maximumSize = Vector2.Zero;

  /** The maximum size the flow may take (zero = use our size, or infinite along autosized axes). */
  get maximumSize(): Vector2 {
    return this._maximumSize;
  }

  set maximumSize(value: Vector2) {
    if (this._maximumSize.equals(value)) return;

    this._maximumSize = value;
    this.invalidate(Invalidation.DrawSize);
  }

  private readonly layout = new LayoutValue(Invalidation.DrawSize);
  private readonly childLayout = new LayoutValue(Invalidation.RequiredParentSizeToFit | Invalidation.Presence, InvalidationSource.Child);

  protected override get requiresChildrenUpdate(): boolean {
    return super.requiresChildrenUpdate || !this.layout.isValid;
  }

  /** Invoke to force a layout update next frame. */
  invalidateLayout(): void {
    this.layout.invalidate();
  }

  private readonly layoutChildren = new Map<Drawable, number>();

  protected override addInternal(drawable: Drawable): void {
    this.layoutChildren.set(drawable, 0);

    // we have to ensure that the layout gets invalidated since Adding or Removing a child will affect the layout. The base class will not invalidate
    // if we are set to AutoSizeAxes.None, but even in that situation, the layout can and often does change when children are added/removed.
    this.invalidateLayout();
    super.addInternal(drawable);
  }

  protected override removeInternal(drawable: Drawable, disposeImmediately: boolean): boolean {
    this.layoutChildren.delete(drawable);

    this.invalidateLayout();
    return super.removeInternal(drawable, disposeImmediately);
  }

  protected override clearInternal(disposeChildren = true): void {
    this.layoutChildren.clear();

    this.invalidateLayout();
    super.clearInternal(disposeChildren);
  }

  /** Changes the position of the drawable in the layout. A higher position value means the drawable will be processed later (that is, the drawables with the lowest position appear first, and the drawable with the highest position appear last). */
  setLayoutPosition(drawable: Drawable, newPosition: number): void {
    if (!this.layoutChildren.has(drawable))
      throw new Error('Cannot change layout position of drawable which is not contained within this FlowContainer.');

    this.layoutChildren.set(drawable, newPosition);
    this.invalidateLayout();
  }

  /** Inserts a new drawable at the specified layout position. */
  insert(position: number, drawable: T): void {
    this.add(drawable);
    this.setLayoutPosition(drawable, position);
  }

  /** Gets the position of the drawable in the layout. */
  getLayoutPosition(drawable: Drawable): number {
    const value = this.layoutChildren.get(drawable);
    if (value === undefined)
      throw new Error('Cannot get layout position of drawable which is not contained within this FlowContainer.');

    return value;
  }

  protected override updateChildrenLife(): boolean {
    const changed = super.updateChildrenLife();

    if (changed)
      this.invalidateLayout();

    return changed;
  }

  /** Gets the children that appear in the flow of this FlowContainer in the order in which they are processed within the flowing layout. */
  get flowingChildren(): Drawable[] {
    return this.aliveInternalChildren
      .filter(d => d.isPresent)
      .sort((a, b) => (this.layoutChildren.get(a)! - this.layoutChildren.get(b)!) || (a.childID - b.childID));
  }

  /** Computes positions for the children of this FlowContainer. Implementers should return one position per child in flowingChildren order. */
  protected abstract computeLayoutPositions(): Iterable<Vector2>;

  private performLayout(): void {
    this.onLayout?.();

    if (this.children.length === 0)
      return;

    const positions = [...this.computeLayoutPositions()];
    const drawables = this.flowingChildren;

    if (positions.length !== drawables.length)
      throw new Error(`${this.constructor.name}.computeLayoutPositions returned a total of ${positions.length} positions for ${drawables.length} children. computeLayoutPositions must return 1 position per child.`);

    for (let i = 0; i < drawables.length; i++) {
      const drawable = drawables[i];
      const pos = positions[i];

      if (drawable.relativePositionAxes !== Axes.None)
        throw new Error(`A flow container cannot contain a child with relative positioning (it is ${drawable.relativePositionAxes}).`);

      const existingTransform = drawable.transformsForTargetMember(FlowTransform.TARGET_MEMBER).find(x => x instanceof FlowTransform) as FlowTransform | undefined;
      const currentTargetPos = existingTransform?.endValue ?? drawable.position;

      if (Precision.almostEqualsVector(currentTargetPos, pos)) continue;

      if (this.layoutDuration > 0) {
        const t = new FlowTransform();
        t.rewindable = false;
        drawable.applyTransform(drawable.populateTransform(t, pos, this.layoutDuration, this.layoutEasing));
      } else {
        if (existingTransform !== undefined) drawable.clearTransforms(false, FlowTransform.TARGET_MEMBER);
        drawable.position = pos;
      }
    }
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    if (!this.childLayout.isValid)
      this.invalidateLayout();

    if (!this.layout.isValid) {
      this.performLayout();
      this.layout.validate();

      // It's important to only validate childLayout after performLayout() is called to ensure it doesn't get re-invalidated.
      this.childLayout.validate();
    }
  }
}

class FlowTransform extends TransformCustom<Vector2, Drawable> {
  static readonly TARGET_MEMBER = 'position';

  constructor() {
    super(FlowTransform.TARGET_MEMBER);
  }
}
