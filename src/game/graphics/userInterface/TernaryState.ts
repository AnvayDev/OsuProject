// Ported from osu.Game/Graphics/UserInterface/TernaryState.cs

/** An on/off state with an extra indeterminate state. */
export enum TernaryState {
  /** The current state is false. */
  False,

  /** The current state is a combination of False and True. The state becomes True if the TernaryStateMenuItem is pressed. */
  Indeterminate,

  /** The current state is true. */
  True,
}
