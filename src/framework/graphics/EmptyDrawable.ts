// Ported from osu.Framework/Graphics/Drawable.cs (Drawable.Empty() and the private EmptyDrawable class).
// A module function instead of a static on Drawable: EmptyDrawable extends Drawable, so Drawable.ts cannot import it.

import { Drawable } from './Drawable';

class EmptyDrawable extends Drawable {
}

/** Creates a new instance of an empty Drawable (Drawable.Empty()). */
export function emptyDrawable(): Drawable {
  return new EmptyDrawable();
}
