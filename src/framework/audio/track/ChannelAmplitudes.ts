// Ported from osu.Framework/Audio/Track/ChannelAmplitudes.cs

/** A collection of information providing per-channel and per-frequency amplitudes of an audio channel. */
export class ChannelAmplitudes {
  /** The length of the frequencyAmplitudes data. */
  static readonly AMPLITUDES_SIZE = 256;

  private static readonly empty_array = new Float32Array(ChannelAmplitudes.AMPLITUDES_SIZE);

  /** 256 length array of bins containing the average frequency of both channels at every ~78Hz step of the audible spectrum (0Hz - 20,000Hz). */
  readonly frequencyAmplitudes: Float32Array;

  constructor(
    /** The amplitude of the left channel (0..1). */
    readonly leftChannel = 0,
    /** The amplitude of the right channel (0..1). */
    readonly rightChannel = 0,
    amplitudes: Float32Array | null = null,
  ) {
    this.frequencyAmplitudes = amplitudes ?? ChannelAmplitudes.empty_array;
  }

  /** The maximum amplitude of the left and right channels (0..1). */
  get maximum(): number {
    return Math.max(this.leftChannel, this.rightChannel);
  }

  /** The average amplitude of the left and right channels (0..1). */
  get average(): number {
    return (this.leftChannel + this.rightChannel) / 2;
  }

  static readonly Empty = new ChannelAmplitudes(0);
}
