// Ported from osu.Framework/IStateful.cs

import type { Signal } from './bindables/Signal';

/** An object which has a state and allows external consumers to change the current state. */
export interface IStateful<T> {
  /** Invoked when the state of this IStateful has changed. */
  readonly stateChanged: Signal<T>;

  /** The current state of this object. */
  state: T;
}
