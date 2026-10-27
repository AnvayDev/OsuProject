// Ported from osu.Game/Database/ImportParameters.cs (PreferHardLinks and ImportImmediately are filesystem/gameplay options with no web equivalent).

export interface ImportParameters {
  /** Whether this import is part of a larger batch. May skip intensive pre-import checks in favour of faster processing. */
  batch?: boolean;
}
