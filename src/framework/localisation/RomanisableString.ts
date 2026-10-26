// Ported from osu.Framework/Localisation/RomanisableString.cs (as resolved by LocalisationManager).
// The ShowUnicode setting defaults to false and there is no settings overlay to change it yet, so the romanised text is preferred, falling back
// to the original when it is empty.

export const romanisable = (original: string, romanised: string): string => (romanised !== '' ? romanised : original);
