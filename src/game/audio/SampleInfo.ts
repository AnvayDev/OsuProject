// Ported from osu.Game/Audio/ISampleInfo.cs and SampleInfo.cs

export interface ISampleInfo {
  /** Retrieve all possible filenames that can be used as a source, returned in order of preference (highest first). */
  readonly lookupNames: readonly string[];

  readonly volume: number;
}

/** Describes a gameplay sample. */
export class SampleInfo implements ISampleInfo {
  readonly lookupNames: readonly string[];

  readonly volume = 100;

  constructor(...sampleNames: string[]) {
    // (Array.Sort on strings is culture-sensitive in C#; sample names are ASCII paths, for which ordinal order differs only in case.)
    this.lookupNames = [...sampleNames].sort();
  }

  equals(other: SampleInfo | null): boolean {
    return other !== null && this.lookupNames.length === other.lookupNames.length && this.lookupNames.every((n, i) => n === other.lookupNames[i]);
  }
}
