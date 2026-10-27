// Ported from osu.Framework/Graphics/Containers/TabbableContainer.cs
// Not ported yet: tab-stop navigation (TabbableContentContainer / ContainerExtensions.MoveFocusToNextTabStop), as nothing sets a content
// container so far.

import type { Drawable } from '../Drawable';
import { Container } from './Container';

/** This interface is used for recognising ITabbableContainer of any type without reflection. */
export interface ITabbableContainer {
  /** Whether this ITabbableContainer can be tabbed to. */
  readonly canBeTabbedTo: boolean;
}

export class TabbableContainer<T extends Drawable = Drawable> extends Container<T> implements ITabbableContainer {
  /** Whether this TabbableContainer can be tabbed to. */
  get canBeTabbedTo(): boolean {
    return true;
  }
}
