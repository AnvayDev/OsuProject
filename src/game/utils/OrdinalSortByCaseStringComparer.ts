// Ported from osu.Game/Utils/OrdinalSortByCaseStringComparer.cs

/** Ordinal (UTF-16 code unit) comparison, as StringComparer.Ordinal. */
function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * This string comparer is something of a cross-over between StringComparer.Ordinal and StringComparer.OrdinalIgnoreCase.
 * StringComparer.OrdinalIgnoreCase is used first, but if the result is "equal" (i.e. the strings are equal ignoring case), then the comparison is
 * repeated with StringComparer.Ordinal, negated so that lowercase letters sort before uppercase ones.
 */
export const OrdinalSortByCaseStringComparer = {
  compare(a: string, b: string): number {
    // (OrdinalIgnoreCase compares the invariant upper-case forms.)
    let result = compareOrdinal(a.toUpperCase(), b.toUpperCase());
    if (result === 0)
      result = -compareOrdinal(a, b); // negative to place lowercase letters before uppercase.
    return result;
  },
};
