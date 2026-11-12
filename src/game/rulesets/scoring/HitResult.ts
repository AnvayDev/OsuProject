// Ported from osu.Game/Rulesets/Scoring/HitResult.cs

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

// #region HitResultExtensions

/** Whether a HitResult increases the combo. */
export const increasesCombo = (result: HitResult): boolean => affectsCombo(result) && isHit(result);

/** Whether a HitResult breaks the combo and resets it back to zero. */
export const breaksCombo = (result: HitResult): boolean => affectsCombo(result) && !isHit(result);

/** Whether a HitResult increases or breaks the combo. */
export function affectsCombo(result: HitResult): boolean {
  switch (result) {
    case HitResult.Miss:
    case HitResult.Meh:
    case HitResult.Ok:
    case HitResult.Good:
    case HitResult.Great:
    case HitResult.Perfect:
    case HitResult.LargeTickHit:
    case HitResult.LargeTickMiss:
    case HitResult.LegacyComboIncrease:
    case HitResult.ComboBreak:
    case HitResult.SliderTailHit:
      return true;

    default:
      return false;
  }
}

/** Whether a HitResult affects the accuracy portion of the score. */
export function affectsAccuracy(result: HitResult): boolean {
  switch (result) {
    // LegacyComboIncrease is a special non-gameplay type which is neither a basic, tick, bonus, or accuracy-affecting result.
    case HitResult.LegacyComboIncrease:
      return false;

    // ComboBreak is a special type that only affects combo. It cannot be considered as basic, tick, bonus, or accuracy-affecting.
    case HitResult.ComboBreak:
      return false;

    default:
      return isScorable(result) && !isBonus(result);
  }
}

/** Whether a HitResult is a non-tick and non-bonus result. */
export function isBasic(result: HitResult): boolean {
  switch (result) {
    // LegacyComboIncrease is a special non-gameplay type which is neither a basic, tick, bonus, or accuracy-affecting result.
    case HitResult.LegacyComboIncrease:
      return false;

    // ComboBreak is a special type that only affects combo. It cannot be considered as basic, tick, bonus, or accuracy-affecting.
    case HitResult.ComboBreak:
      return false;

    default:
      return isScorable(result) && !isTick(result) && !isBonus(result);
  }
}

/** Whether a HitResult should be counted as a tick. */
export function isTick(result: HitResult): boolean {
  switch (result) {
    case HitResult.LargeTickHit:
    case HitResult.LargeTickMiss:
    case HitResult.SmallTickHit:
    case HitResult.SmallTickMiss:
    case HitResult.SliderTailHit:
      return true;

    default:
      return false;
  }
}

/** Whether a HitResult should be counted as bonus score. */
export function isBonus(result: HitResult): boolean {
  switch (result) {
    case HitResult.SmallBonus:
    case HitResult.LargeBonus:
      return true;

    default:
      return false;
  }
}

/** Whether a HitResult represents a miss of any type. Of note, both isMiss and isHit return false for HitResult.None. */
export function isMiss(result: HitResult): boolean {
  switch (result) {
    case HitResult.IgnoreMiss:
    case HitResult.Miss:
    case HitResult.SmallTickMiss:
    case HitResult.LargeTickMiss:
    case HitResult.ComboBreak:
      return true;

    default:
      return false;
  }
}

/** Whether a HitResult represents a successful hit. Of note, both isMiss and isHit return false for HitResult.None. */
export function isHit(result: HitResult): boolean {
  switch (result) {
    case HitResult.None:
    case HitResult.IgnoreMiss:
    case HitResult.Miss:
    case HitResult.SmallTickMiss:
    case HitResult.LargeTickMiss:
    case HitResult.ComboBreak:
      return false;

    default:
      return true;
  }
}

/** Whether a HitResult is scorable. */
export function isScorable(result: HitResult): boolean {
  switch (result) {
    // LegacyComboIncrease is not actually scorable (in terms of usable by rulesets for that purpose), but needs to be defined as such to be correctly included in statistics output.
    case HitResult.LegacyComboIncrease:
      return true;

    // ComboBreak is its own type that affects score via combo.
    case HitResult.ComboBreak:
      return true;

    case HitResult.SliderTailHit:
      return true;

    default:
      // Note that IgnoreHit and IgnoreMiss are excluded as they do not affect score.
      return result >= HitResult.Miss && result < HitResult.IgnoreMiss;
  }
}

/** An array of all scorable HitResults. */
export const ALL_TYPES: readonly HitResult[] = (Object.values(HitResult).filter(v => typeof v === 'number') as HitResult[])
  .filter(r => r !== HitResult.LegacyComboIncrease);

/** Whether a HitResult is valid within a given HitResult range. */
export function isValidHitResult(result: HitResult, minResult: HitResult, maxResult: HitResult): boolean {
  if (result === HitResult.None)
    return false;

  if (result === minResult || result === maxResult)
    return true;

  return result > minResult && result < maxResult;
}

/** The [Order] of each HitResult: perfect first. */
const order: readonly HitResult[] = [
  HitResult.Perfect, HitResult.Great, HitResult.Good, HitResult.Ok, HitResult.Meh, HitResult.Miss, HitResult.LargeTickHit,
  HitResult.SmallTickHit, HitResult.SliderTailHit, HitResult.LargeBonus, HitResult.SmallBonus, HitResult.LargeTickMiss,
  HitResult.SmallTickMiss, HitResult.IgnoreHit, HitResult.IgnoreMiss, HitResult.None, HitResult.ComboBreak, HitResult.LegacyComboIncrease,
];

/** Ordered index of a HitResult. Used for consistent order when displaying hit results to the user. */
export const getIndexForOrderedDisplay = (result: HitResult): number => order.indexOf(result);

/** The [Description] of each HitResult, as displayed to the user. */
export function getDescription(result: HitResult): string {
  switch (result) {
    case HitResult.None: return '';
    case HitResult.Miss: return 'Miss';
    case HitResult.Meh: return 'Meh';
    case HitResult.Ok: return 'OK';
    case HitResult.Good: return 'Good';
    case HitResult.Great: return 'Great';
    case HitResult.Perfect: return 'Perfect';
    case HitResult.SmallTickHit: return 'S Tick';
    case HitResult.LargeTickHit: return 'L Tick';
    case HitResult.SmallBonus: return 'S Bonus';
    case HitResult.LargeBonus: return 'L Bonus';
    default: return HitResult[result];
  }
}

/** Ensures that a maximum and a minimum HitResult are a valid pair (throws otherwise). */
export function validateHitResultPair(maxResult: HitResult, minResult: HitResult): void {
  if (maxResult === HitResult.None || !isHit(maxResult))
    throw new RangeError(`${HitResult[maxResult]} is not a valid maximum judgement result.`);

  if (minResult === HitResult.None || isHit(minResult))
    throw new RangeError(`${HitResult[minResult]} is not a valid minimum judgement result.`);

  if (maxResult === HitResult.IgnoreHit && minResult !== HitResult.IgnoreMiss && minResult !== HitResult.ComboBreak)
    throw new RangeError(`${HitResult[minResult]} is not a valid minimum result for a ${HitResult[maxResult]} judgement.`);

  if (isBonus(maxResult) && minResult !== HitResult.IgnoreMiss)
    throw new RangeError(`${HitResult[HitResult.IgnoreMiss]} is the only valid minimum result for a ${HitResult[maxResult]} judgement.`);

  if (minResult === HitResult.IgnoreMiss)
    return;

  if (maxResult === HitResult.SliderTailHit && minResult !== HitResult.LargeTickMiss)
    throw new RangeError(`${HitResult[HitResult.LargeTickMiss]} is the only valid minimum result for a ${HitResult[maxResult]} judgement.`);

  if (maxResult === HitResult.LargeTickHit && minResult !== HitResult.LargeTickMiss)
    throw new RangeError(`${HitResult[HitResult.LargeTickMiss]} is the only valid minimum result for a ${HitResult[maxResult]} judgement.`);

  if (maxResult === HitResult.SmallTickHit && minResult !== HitResult.SmallTickMiss)
    throw new RangeError(`${HitResult[HitResult.SmallTickMiss]} is the only valid minimum result for a ${HitResult[maxResult]} judgement.`);

  if (isBasic(maxResult) && minResult !== HitResult.Miss)
    throw new RangeError(`${HitResult[HitResult.Miss]} is the only valid minimum result for a ${HitResult[maxResult]} judgement.`);
}

// #endregion
