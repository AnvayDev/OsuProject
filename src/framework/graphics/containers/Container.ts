// Ported from osu.Framework/Graphics/Containers/Container.cs
// The `new` re-declarations that make CompositeDrawable's protected setters public are unnecessary here:
// those members are already public on CompositeDrawable in this port.

import { Drawable } from '../Drawable';
import { CompositeDrawable } from './CompositeDrawable';

/** A drawable which can have children added to it. Transformations applied to a container are also applied to its children. */
export class Container<T extends Drawable = Drawable> extends CompositeDrawable {
  /** The content of this container. children and all methods that mutate children operate on it. Override to redirect to a sub-container. */
  protected get content(): Container<T> {
    return this;
  }

  /** The publicly accessible list of children. Forwards to the children of content. */
  get children(): readonly T[] {
    if (this.content !== this)
      return this.content.children;

    return this.internalChildren as readonly T[];
  }

  set children(value: Iterable<T>) {
    if (this.isDisposed)
      return;

    this.clear();
    this.addRange(value);
  }

  /** The publicly accessible list of alive children. */
  get aliveChildren(): readonly T[] {
    if (this.content !== this)
      return this.content.aliveChildren;

    return this.aliveInternalChildren as readonly T[];
  }

  /** The amount of elements in children. */
  get count(): number {
    return this.children.length;
  }

  /** Gets or sets the only child of this container. */
  get child(): T {
    if (this.children.length !== 1)
      throw new Error(`Cannot call InternalChild unless there's exactly one Drawable in Children (currently ${this.children.length})!`);

    return this.children[0];
  }

  set child(value: T) {
    if (this.isDisposed)
      return;

    this.clear();
    this.add(value);
  }

  /** The index of a given child within children, or a negative value if not contained. */
  indexOf(drawable: T): number {
    if (this.content !== this)
      return this.content.indexOf(drawable);

    return this.indexOfInternal(drawable);
  }

  /** Checks whether a given child is contained within children. */
  containsChild(drawable: T): boolean {
    const index = this.indexOf(drawable);
    return index >= 0 && this.children[index] === drawable;
  }

  /** Adds a child to this container. This amounts to adding a child to content's children, recursing until content == this. */
  add(drawable: T): void {
    if ((drawable as Drawable) === (this.content as Drawable))
      throw new Error('Content may not be added to itself.');

    if (drawable == null)
      throw new Error('drawable may not be null.');

    if (drawable.isDisposed)
      throw new Error(`Cannot add disposed drawable ${drawable}.`);

    if (this.content === this)
      this.addInternal(drawable);
    else
      this.content.add(drawable);
  }

  /** Adds a range of children. */
  addRange(range: Iterable<T>): void {
    if (range instanceof Container)
      throw new Error(`Attempting to add a IContainer as a range of children to ${this}. If intentional, consider using the Children property instead.`);

    for (const d of range)
      this.add(d);
  }

  /** Removes a given child from this container. */
  remove(drawable: T, disposeImmediately: boolean): boolean {
    if (this.content !== this)
      return this.content.remove(drawable, disposeImmediately);

    return this.removeInternal(drawable, disposeImmediately);
  }

  /** Removes all children which match the given predicate. Returns the amount removed. */
  removeAll(pred: (d: T) => boolean, disposeImmediately: boolean): number {
    if (this.content !== this)
      return this.content.removeAll(pred, disposeImmediately);

    let removedCount = 0;

    for (let i = 0; i < this.internalChildren.length; i++) {
      const tChild = this.internalChildren[i] as T;

      if (pred(tChild)) {
        this.removeInternal(tChild, disposeImmediately);
        removedCount++;
        i--;
      }
    }

    return removedCount;
  }

  /** Removes a range of children. */
  removeRange(range: Iterable<T> | null, disposeImmediately: boolean): void {
    if (range === null)
      return;

    for (const p of range)
      this.remove(p, disposeImmediately);
  }

  /** Removes all children (disposing them by default). */
  clear(disposeChildren = true): void {
    if (this.content !== null && this.content !== this)
      this.content.clear(disposeChildren);
    else
      this.clearInternal(disposeChildren);
  }

  /** Changes the depth of a child. This affects ordering of children. */
  changeChildDepth(child: T, newDepth: number): void {
    if (this.content !== this)
      this.content.changeChildDepth(child, newDepth);
    else
      this.changeInternalChildDepth(child, newDepth);
  }

  [Symbol.iterator](): Iterator<T> {
    return this.children[Symbol.iterator]();
  }
}
