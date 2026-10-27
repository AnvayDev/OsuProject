// Ported from osu.Framework/Graphics/Containers/ContainerExtensions.cs (Wrap).

import { Axes } from '../../layout/Enums';
import { Vector2 } from '../../layout/Vector2';
import type { Drawable } from '../Drawable';
import type { Container } from './Container';

/**
 * Wraps the given drawable with the given container such that the container can be used instead of the drawable without affecting the
 * layout. The container must not contain any children before wrapping.
 */
export function wrap<TContainer extends Container<TChild>, TChild extends Drawable>(container: TContainer, drawable: TChild): TContainer {
  if (container.children.length !== 0)
    throw new Error('You may not wrap a Container that has children.');

  container.relativeSizeAxes = drawable.relativeSizeAxes;
  container.autoSizeAxes = Axes.Both & ~drawable.relativeSizeAxes;
  container.anchor = drawable.anchor;
  container.origin = drawable.origin;
  container.position = drawable.position;
  container.rotation = drawable.rotation;

  drawable.position = Vector2.Zero;
  drawable.rotation = 0;

  // For anchor/origin positioning to be preserved correctly,
  // relatively sized axes must be lifted to the wrapping container.
  if ((container.relativeSizeAxes & Axes.X) !== 0) {
    container.width = drawable.width;
    drawable.width = 1;
  }

  if ((container.relativeSizeAxes & Axes.Y) !== 0) {
    container.height = drawable.height;
    drawable.height = 1;
  }

  container.add(drawable);

  return container;
}
