// Ported from osu.Framework/Graphics/UserInterface/Caret.cs

import type { Vector2 } from '../../layout/Vector2';
import { CompositeDrawable } from '../containers/CompositeDrawable';

/** A UI component generally used to show the current cursor location in a text edit field. */
export abstract class Caret extends CompositeDrawable {
  /** Request the caret be displayed at a particular location, with an optional selection length. */
  abstract displayAt(position: Vector2, selectionWidth: number | null): void;
}
