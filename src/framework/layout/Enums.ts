// Ported from the enums at the end of osu.Framework/Graphics/Drawable.cs (Invalidation, Anchor, Axes, Edges, Direction,
// RotationDirection, LoadState, FillMode) and osu.Framework/Graphics/Containers/FillFlowContainer.cs (FillDirection).
// Values are identical to the C# flags.

export enum Invalidation {
  /** DrawInfo has changed. No change to DrawSize is assumed. */
  DrawInfo = 1,

  /** DrawSize has changed. */
  DrawSize = 1 << 1,

  /** Captures all other geometry changes than DrawInfo and DrawSize, such as Rotation, Shear, and DrawPosition. */
  MiscGeometry = 1 << 2,

  /** Our colour changed. */
  Colour = 1 << 3,

  /** The DrawNode needs to be re-generated. (DOM: the element's non-geometry styles need re-writing.) */
  DrawNode = 1 << 4,

  /** Presence changed (e.g. Alpha or AlwaysPresent). */
  Presence = 1 << 5,

  /** A parent changed (used internally). */
  Parent = 1 << 6,

  /** No invalidation. */
  None = 0,

  /** RequiredParentSizeToFit has changed. */
  RequiredParentSizeToFit = MiscGeometry | DrawSize,

  /** All possible things are affected. */
  All = DrawNode | RequiredParentSizeToFit | Colour | DrawInfo | Presence,

  /** Only the layout flags. */
  Layout = All & ~(DrawNode | Parent),
}

/** General enum to specify an "anchor" or "origin" point from the standard 9 points on a rectangle. x and y counterparts can be accessed using bitwise flags. */
export enum Anchor {
  /** The vertical counterpart is at "Top" position. */
  y0 = 1,

  /** The vertical counterpart is at "Centre" position. */
  y1 = 1 << 1,

  /** The vertical counterpart is at "Bottom" position. */
  y2 = 1 << 2,

  /** The horizontal counterpart is at "Left" position. */
  x0 = 1 << 3,

  /** The horizontal counterpart is at "Centre" position. */
  x1 = 1 << 4,

  /** The horizontal counterpart is at "Right" position. */
  x2 = 1 << 5,

  /** The user is manually updating the outcome, so we shouldn't. */
  Custom = 1 << 6,

  TopLeft = y0 | x0,
  TopCentre = y0 | x1,
  TopRight = y0 | x2,

  CentreLeft = y1 | x0,
  Centre = y1 | x1,
  CentreRight = y1 | x2,

  BottomLeft = y2 | x0,
  BottomCentre = y2 | x1,
  BottomRight = y2 | x2,
}

export enum Axes {
  None = 0,

  X = 1,
  Y = 1 << 1,

  Both = X | Y,
}

export enum Edges {
  None = 0,

  Top = 1,
  Left = 1 << 1,
  Bottom = 1 << 2,
  Right = 1 << 3,

  Horizontal = Left | Right,
  Vertical = Top | Bottom,

  All = Top | Left | Bottom | Right,
}

export enum Direction {
  Horizontal,
  Vertical,
}

export enum RotationDirection {
  Clockwise,
  Counterclockwise,
}

/** Possible states of a Drawable within the loading pipeline. */
export enum LoadState {
  /** Not loaded, and no load has been initiated yet. */
  NotLoaded,

  /** Currently loading (possibly and usually on a background thread via LoadComponentAsync). */
  Loading,

  /** Loading is complete, but has not yet been finalized on the update thread (LoadComplete has not been called yet). */
  Ready,

  /** Loading is fully completed and the Drawable is now part of the scene graph. */
  Loaded,
}

/** Controls the behavior of RelativeSizeAxes when it is set to Axes.Both. */
export enum FillMode {
  /** Completely fill the parent with a relative size of 1 at the cost of stretching the aspect ratio (default). */
  Stretch,

  /** Always maintains aspect ratio while filling the portion of the parent's size denoted by the relative size. A relative size of 1 results in completely filling the parent by scaling the smaller axis of the drawable to fill the parent. */
  Fill,

  /** Always maintains aspect ratio while fitting into the portion of the parent's size denoted by the relative size. A relative size of 1 results in fitting exactly into the parent by scaling the larger axis of the drawable to fit into the parent. */
  Fit,
}

/** Ported from osu.Framework/Graphics/Containers/FillFlowContainer.cs */
export enum FillDirection {
  /** Fill horizontally first, then fill vertically via multiple rows. */
  Full,

  /** Fill only horizontally. */
  Horizontal,

  /** Fill only vertically. */
  Vertical,
}
