// Ported from osu.Game/Utils/ZipUtils.cs (the stream overload).

import { ZipArchiveReader } from '../io/archives/ZipArchiveReader';

export const ZipUtils = {
  /** Whether the stream is a zip archive with at least one entry (an empty zip doesn't count). */
  isZipArchive(stream: Uint8Array): boolean {
    try {
      const arc = new ZipArchiveReader(stream, '');
      arc.validateEntries();
      return arc.entryCount > 0;
    } catch {
      return false;
    }
  },
};
