// Ported from osu.Game/Database/ImportTask.cs (the stream form: a browser import is always bytes plus a name).

import type { ArchiveReader } from '../io/archives/ArchiveReader';
import { MemoryStreamArchiveReader } from '../io/archives/MemoryStreamArchiveReader';
import { ZipArchiveReader } from '../io/archives/ZipArchiveReader';
import { ZipUtils } from '../utils/ZipUtils';

/** An encapsulated import task to be imported to an IModelImporter. */
export class ImportTask {
  /** The path to the file (or filename in the case a stream is provided). */
  readonly path: string;

  /** An optional stream which provides the file content. */
  readonly stream: Uint8Array;

  /** Construct a new import task from a stream. */
  constructor(stream: Uint8Array, filename: string) {
    this.path = filename;
    this.stream = stream;
  }

  /** Retrieve an archive reader from this task. */
  getReader(): ArchiveReader {
    if (ZipUtils.isZipArchive(this.stream))
      return new ZipArchiveReader(this.stream, this.path);

    return new MemoryStreamArchiveReader(this.stream, this.path);
  }

  toString(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
}
