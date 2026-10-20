// Ported from osu.Game/Beatmaps/Timing/TimeSignature.cs

/** Stores the time signature of a track. For now, the lower numeral can only be 4; support for other denominators can be considered at a later date. */
export class TimeSignature {
  constructor(readonly numerator: number) {
    if (numerator <= 0)
      throw new RangeError(`numerator ('${numerator}') must be a non-negative and non-zero value.`);
  }

  static readonly SimpleTriple = new TimeSignature(3);
  static readonly SimpleQuadruple = new TimeSignature(4);

  toString(): string {
    return `${this.numerator}/4`;
  }

  equals(other: TimeSignature | null): boolean {
    return other !== null && this.numerator === other.numerator;
  }
}
