// Ported from osu.Game/IO/Archives/ArchiveReader.cs. Streams are byte arrays (the whole archive is in memory, as with C#'s MemoryStream input).

export abstract class ArchiveReader {
  /** Opens a stream for reading a specific file from this archive. */
  abstract getStream(name: string): Uint8Array | null;

  getAvailableResources(): readonly string[] {
    return this.filenames;
  }

  dispose(): void {
  }

  /** The name of this archive (usually the containing filename). */
  readonly name: string;

  protected constructor(name: string) {
    this.name = name;
  }

  abstract get filenames(): readonly string[];

  get(name: string): Uint8Array | null {
    return this.getStream(name);
  }
}
