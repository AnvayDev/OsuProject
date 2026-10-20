// Ported from osu.Game/Beatmaps/Formats/Decoder.cs. Decoder types are keyed by the output class (C#'s typeof(T)). C#'s static constructor
// registers the decoders; here each decoder module registers itself when it is loaded (an import of Decoder.ts can't load them without an
// import cycle), so import the decoder module (e.g. LegacyBeatmapDecoder) before calling getDecoder.

import type { LineBufferedReader } from '../../io/LineBufferedReader';

type OutputType<T = unknown> = abstract new (...args: any[]) => T;

export abstract class Decoder {
  private static readonly decoders = new Map<OutputType, Map<string, (magic: string) => Decoder>>();
  private static readonly fallback_decoders = new Map<OutputType, () => Decoder>();

  /**
   * Retrieves a Decoder to parse a Beatmap.
   * stream: a stream pointing to the Beatmap.
   */
  static getDecoder<T>(type: OutputType<T>, stream: LineBufferedReader): DecoderOf<T> {
    const typedDecoders = Decoder.decoders.get(type);

    if (typedDecoders === undefined)
      throw new Error('Unknown decoder type');

    // start off with the first line of the file
    let line = stream.peekLine()?.trim() ?? null;

    while (line !== null && line.length === 0) {
      // consume the previously peeked empty line and advance to the next one
      stream.readLine();
      line = stream.peekLine()?.trim() ?? null;
    }

    if (line === null)
      throw new Error('Unknown file format (no content)');

    const decoder = [...typedDecoders].find(([magic]) => line.startsWith(magic))?.[1];

    // it's important the magic does NOT get consumed here, since sometimes it's part of the structure
    // (see JsonBeatmapDecoder - the magic string is the opening brace)
    // decoder implementations should therefore not die on receiving their own magic
    if (decoder !== undefined)
      return decoder(line) as DecoderOf<T>;

    const fallbackDecoder = Decoder.fallback_decoders.get(type);

    if (fallbackDecoder === undefined)
      throw new Error(`Unknown file format (${line})`);

    return fallbackDecoder() as DecoderOf<T>;
  }

  /**
   * Registers an instantiation function for a Decoder.
   * magic: a string in the file which triggers this decoder to be used.
   * constructor: a function which constructs the Decoder given magic.
   */
  protected static addDecoder(type: OutputType, magic: string, constructor: (magic: string) => Decoder): void {
    let typedDecoders = Decoder.decoders.get(type);

    if (typedDecoders === undefined)
      Decoder.decoders.set(type, typedDecoders = new Map());

    typedDecoders.set(magic, constructor);
  }

  /**
   * Registers a fallback decoder instantiation function.
   * The fallback will be returned if the first non-empty line of the decoded stream does not match any known magic.
   * Calling this method will overwrite any existing global fallback registration for type T - use with caution.
   */
  protected static setFallbackDecoder(type: OutputType, constructor: () => Decoder): void {
    Decoder.fallback_decoders.set(type, constructor);
  }
}

/** C#'s Decoder<TOutput>. */
export abstract class DecoderOf<TOutput> extends Decoder {
  /** C#'s `new TOutput()`; TypeScript can't construct a type parameter, so each decoder supplies it. */
  protected abstract createTemplateObject(): TOutput;

  decode(primaryStream: LineBufferedReader, ...otherStreams: LineBufferedReader[]): TOutput {
    const output = this.createTemplateObject();
    for (const stream of [primaryStream, ...otherStreams])
      this.parseStreamInto(stream, stream === primaryStream, output);
    return output;
  }

  protected abstract parseStreamInto(stream: LineBufferedReader, isPrimaryStream: boolean, output: TOutput): void;
}
