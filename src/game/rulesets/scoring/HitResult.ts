// Ported from osu.Game/Rulesets/Scoring/HitResult.cs (the enum; extensions are ported when needed).

export enum HitResult {
  None,
  Miss,
  Meh,
  Ok,
  Good,
  Great,
  Perfect,
  SmallTickMiss,
  SmallTickHit,
  LargeTickMiss,
  LargeTickHit,
  SmallBonus,
  LargeBonus,
  IgnoreMiss,
  IgnoreHit,
  ComboBreak,
  SliderTailHit,
  LegacyComboIncrease = 99,
}
