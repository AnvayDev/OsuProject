// Ported from osu.Game/Audio/HitSampleInfo.cs. C#'s With(Optional<T> ...) becomes with({...}): a present key is "provided" (even if null).

/** Describes a gameplay hit sample. */
export class HitSampleInfo {
  static readonly HIT_NORMAL = 'hitnormal';
  static readonly HIT_WHISTLE = 'hitwhistle';
  static readonly HIT_FINISH = 'hitfinish';
  static readonly HIT_CLAP = 'hitclap';

  static readonly BANK_NORMAL = 'normal';
  static readonly BANK_SOFT = 'soft';
  static readonly BANK_DRUM = 'drum';

  // new sample used exclusively by taiko for now.
  static readonly HIT_FLOURISH = 'hitflourish';

  // new bank used exclusively by taiko for now.
  static readonly BANK_STRONG = 'strong';

  /** All valid sample addition constants. */
  static readonly ALL_ADDITIONS = [HitSampleInfo.HIT_WHISTLE, HitSampleInfo.HIT_FINISH, HitSampleInfo.HIT_CLAP];

  /** All valid bank constants. */
  static readonly ALL_BANKS = [HitSampleInfo.BANK_NORMAL, HitSampleInfo.BANK_SOFT, HitSampleInfo.BANK_DRUM];

  constructor(
    /** The name of the sample to load. */
    readonly name: string,
    /** The bank to load the sample from. */
    readonly bank: string = HitSampleInfo.BANK_NORMAL,
    /** An optional suffix to provide priority lookup. Falls back to non-suffixed name. */
    readonly suffix: string | null = null,
    /** The sample volume. */
    readonly volume = 100,
    /** Whether this sample should automatically assign the bank of the normal sample whenever it is set in the editor. */
    readonly editorAutoBank = true,
    /** Whether this hit sample can be sourced from the beatmap skin. */
    readonly useBeatmapSamples = false,
  ) {}

  /** Retrieve all possible filenames that can be used as a source, returned in order of preference (highest first). */
  get lookupNames(): string[] {
    const names: string[] = [];

    if (this.suffix)
      names.push(`Gameplay/${this.bank}-${this.name}${this.suffix}`);

    names.push(`Gameplay/${this.bank}-${this.name}`);
    names.push(`Gameplay/${this.name}`);

    return names;
  }

  /** Creates a new HitSampleInfo with overridden values. */
  with(changes: HitSampleInfoChanges = {}): HitSampleInfo {
    return new HitSampleInfo(
      'name' in changes ? changes.name! : this.name,
      'bank' in changes ? changes.bank! : this.bank,
      'suffix' in changes ? changes.suffix! : this.suffix,
      'volume' in changes ? changes.volume! : this.volume,
      'editorAutoBank' in changes ? changes.editorAutoBank! : this.editorAutoBank,
      'useBeatmapSamples' in changes ? changes.useBeatmapSamples! : this.useBeatmapSamples,
    );
  }

  equals(other: HitSampleInfo | null): boolean {
    return other !== null && this.name === other.name && this.bank === other.bank && this.suffix === other.suffix && this.useBeatmapSamples === other.useBeatmapSamples;
  }
}

export interface HitSampleInfoChanges {
  name?: string;
  bank?: string;
  suffix?: string | null;
  volume?: number;
  editorAutoBank?: boolean;
  useBeatmapSamples?: boolean;
}
