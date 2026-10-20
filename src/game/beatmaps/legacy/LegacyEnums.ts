// Ported from osu.Game/Beatmaps/Legacy/LegacyHitObjectType.cs, LegacyHitSoundType.cs, LegacySampleBank.cs, LegacyEffectFlags.cs and LegacyEventType.cs

export enum LegacyHitObjectType {
  Circle = 1,
  Slider = 1 << 1,
  NewCombo = 1 << 2,
  Spinner = 1 << 3,
  ComboOffset = (1 << 4) | (1 << 5) | (1 << 6),
  Hold = 1 << 7,
  ObjectTypes = Circle | Slider | Spinner | Hold,
}

export enum LegacyHitSoundType {
  None = 0,
  Normal = 1,
  Whistle = 2,
  Finish = 4,
  Clap = 8,
}

export enum LegacySampleBank {
  None = 0,
  Normal = 1,
  Soft = 2,
  Drum = 3,
}

export enum LegacyEffectFlags {
  None = 0,
  Kiai = 1,
  OmitFirstBarLine = 8,
}

export enum LegacyEventType {
  Background = 0,
  Video = 1,
  Break = 2,
  Colour = 3,
  Sprite = 4,
  Sample = 5,
  Animation = 6,
}

/** C# Enum.TryParse for an enum: accepts a member name (case-sensitive) or an integer string. Returns undefined if neither matches. */
export function tryParseEnum<E extends Record<string, string | number>>(enumObject: E, value: string): E[keyof E] | undefined {
  const s = value.trim();

  if (/^[+-]?\d+$/.test(s))
    return Number(s) as E[keyof E];

  const v = enumObject[s as keyof E];
  return typeof v === 'number' ? v : undefined;
}

/** C# Enum.Parse: as tryParseEnum, but throws for unknown values. */
export function parseEnum<E extends Record<string, string | number>>(enumObject: E, value: string): E[keyof E] {
  const v = tryParseEnum(enumObject, value);
  if (v === undefined)
    throw new Error(`Requested value '${value}' was not found.`);
  return v;
}
