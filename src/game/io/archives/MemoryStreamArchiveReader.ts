// Ported from osu.Game/IO/Archives/MemoryStreamArchiveReader.cs

import { ArchiveReader } from './ArchiveReader';

/** Allows reading a single file from the provided stream. */
export class MemoryStreamArchiveReader extends ArchiveReader {
  constructor(private readonly stream: Uint8Array, filename: string) {
    super(filename);
  }

  override getStream(_name: string): Uint8Array {
    return this.stream.slice();
  }

  override get filenames(): readonly string[] {
    return [this.name];
  }
}
