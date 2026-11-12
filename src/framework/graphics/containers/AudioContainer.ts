// Ported from osu.Framework/Graphics/Containers/AudioContainer.cs (the collection members that are used).

import type { Drawable } from '../Drawable';
import { DrawableAudioWrapper } from '../audio/DrawableAudioWrapper';
import type { Axes } from '../../layout/Enums';
import { Container } from './Container';

/** A container which exposes audio adjustments via IAdjustableAudioComponent, applying them to its children's audio. */
export class AudioContainer<T extends Drawable = Drawable> extends DrawableAudioWrapper {
  private readonly container: Container<T>;

  constructor() {
    const container = new Container<T>();
    super(container);
    this.container = container;
  }

  override get relativeSizeAxes(): Axes {
    return this.container.relativeSizeAxes;
  }

  override set relativeSizeAxes(value: Axes) {
    super.relativeSizeAxes = value;
    this.container.relativeSizeAxes = value;
  }

  get children(): readonly T[] {
    return this.container.children;
  }

  set children(value: Iterable<T>) {
    this.container.children = value;
  }

  get child(): T {
    return this.container.child;
  }

  set child(value: T) {
    this.container.child = value;
  }

  get count(): number {
    return this.container.count;
  }

  add(drawable: T): void {
    this.container.add(drawable);
  }

  addRange(collection: Iterable<T>): void {
    this.container.addRange(collection);
  }

  clear(disposeChildren = true): void {
    this.container.clear(disposeChildren);
  }

  remove(drawable: T, disposeImmediately: boolean): boolean {
    return this.container.remove(drawable, disposeImmediately);
  }

  removeAll(match: (d: T) => boolean, disposeImmediately: boolean): number {
    return this.container.removeAll(match, disposeImmediately);
  }
}
