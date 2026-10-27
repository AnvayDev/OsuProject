// Ported from osu.Game/IO/Archives/ZipArchiveReader.cs. SharpCompress is replaced by a central-directory reader with fflate's inflate, which keeps
// SharpCompress's behaviours that osu! relies on: entries in central-directory order, names decoded as Shift-JIS (code page 932) unless the
// entry has the UTF-8 flag or an Info-ZIP Unicode path field, directory entries (name ending in '/', or '\' with no data), duplicate names
// throwing on lookup, lazy decompression per GetStream, and the CRC-32 check of each extracted entry (a damaged download fails to import).
// Only the stored and deflate methods are supported (SharpCompress has more).

import { inflateSync } from 'fflate';
import { excludeSystemFileNames } from '@fw/io/ResourceStore';
import { ArchiveReader } from './ArchiveReader';

interface ZipEntry {
  readonly key: string;
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localHeaderOffset: number;
  readonly isDirectory: boolean;
}

export class ZipArchiveReader extends ArchiveReader {
  /** Archives created by osu!stable still write out as Shift-JIS. We want to force this fallback rather than leave it up to the library/system. */
  static readonly DEFAULT_ENCODING = 'shift_jis';

  private readonly entries: readonly ZipEntry[];

  /**
   * Specifies the maximum permitted size of files (in bytes) in the archive.
   * If a ZIP archive specifies a file entry which exceeds this size, attempting to access this file via getStream will fail.
   */
  maximumEntrySize = 100 * 1024 * 1024; // bytes

  constructor(private readonly archiveStream: Uint8Array, name: string) {
    super(name);

    this.entries = readCentralDirectory(archiveStream);
  }

  override getStream(name: string): Uint8Array | null {
    const matches = this.entries.filter(e => e.key === name);

    if (matches.length > 1)
      throw new Error('Sequence contains more than one matching element');

    const entry = matches[0];
    if (entry === undefined)
      return null;

    if (entry.size > this.maximumEntrySize)
      throw new Error(`Size of file "${name}" exceeds allowable limit of ${this.maximumEntrySize} bytes`);

    return readEntryData(this.archiveStream, entry);
  }

  override get filenames(): readonly string[] {
    return excludeSystemFileNames(this.entries.filter(e => !e.isDirectory).map(e => e.key));
  }

  /** The number of entries (directories included), for ZipUtils.isZipArchive. */
  get entryCount(): number {
    return this.entries.length;
  }

  /** Validates every entry's local header without decompressing (SharpCompress opening each entry stream). */
  validateEntries(): void {
    for (const entry of this.entries)
      localDataOffset(this.archiveStream, entry);
  }
}

const utf8 = new TextDecoder('utf-8');
const shiftJis = new TextDecoder(ZipArchiveReader.DEFAULT_ENCODING);

function readCentralDirectory(data: Uint8Array): ZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xFFFF); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }

  if (eocd < 0)
    throw new Error('Failed to locate the Zip Header');

  let entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  if (entryCount === 0xFFFF || offset === 0xFFFFFFFF) {
    const locator = eocd - 20;
    if (locator < 0 || view.getUint32(locator, true) !== 0x07064b50)
      throw new Error('Failed to locate the Zip64 Header');

    const zip64 = Number(view.getBigUint64(locator + 8, true));
    if (view.getUint32(zip64, true) !== 0x06064b50)
      throw new Error('Failed to locate the Zip64 Header');

    entryCount = Number(view.getBigUint64(zip64 + 32, true));
    offset = Number(view.getBigUint64(zip64 + 48, true));
  }

  const entries: ZipEntry[] = [];

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('Unknown header in the central directory');

    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    let compressedSize = view.getUint32(offset + 20, true);
    let size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    let localHeaderOffset = view.getUint32(offset + 42, true);

    const nameBytes = data.subarray(offset + 46, offset + 46 + nameLength);
    let key = (flags & 0x800) !== 0 ? utf8.decode(nameBytes) : shiftJis.decode(nameBytes);

    for (let e = offset + 46 + nameLength; e + 4 <= offset + 46 + nameLength + extraLength;) {
      const id = view.getUint16(e, true);
      const length = view.getUint16(e + 2, true);
      const field = e + 4;

      if (id === 0x0001) {
        // Zip64 extended information: only the fields that overflowed are present, in this order.
        let p = field;
        if (size === 0xFFFFFFFF) { size = Number(view.getBigUint64(p, true)); p += 8; }
        if (compressedSize === 0xFFFFFFFF) { compressedSize = Number(view.getBigUint64(p, true)); p += 8; }
        if (localHeaderOffset === 0xFFFFFFFF) localHeaderOffset = Number(view.getBigUint64(p, true));
      } else if (id === 0x7075 && length > 5 && data[field] === 1) {
        // Info-ZIP Unicode path (version 1, CRC-32 of the header name, UTF-8 name).
        key = utf8.decode(data.subarray(field + 5, field + length));
      }

      e = field + length;
    }

    const isDirectory = key.endsWith('/') || (compressedSize === 0 && size === 0 && key.endsWith('\\'));

    entries.push({ key, flags, method, crc, compressedSize, size, localHeaderOffset, isDirectory });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function localDataOffset(data: Uint8Array, entry: ZipEntry): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header = entry.localHeaderOffset;

  if (header + 30 > data.length || view.getUint32(header, true) !== 0x04034b50)
    throw new Error('Unknown local file header');

  return header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
}

function readEntryData(data: Uint8Array, entry: ZipEntry): Uint8Array {
  if ((entry.flags & 0x1) !== 0)
    throw new Error(`Entry "${entry.key}" is encrypted`);

  const start = localDataOffset(data, entry);
  const compressed = data.subarray(start, start + entry.compressedSize);

  let result: Uint8Array;

  switch (entry.method) {
    case 0:
      result = compressed.slice();
      break;

    case 8:
      result = inflateSync(compressed, { out: new Uint8Array(entry.size) });
      break;

    default:
      throw new Error(`Unsupported compression method ${entry.method} for "${entry.key}"`);
  }

  if (result.length !== entry.size || crc32(result) !== entry.crc)
    throw new Error(`Bad CRC for "${entry.key}": the archive is damaged`);

  return result;
}

const crc_table = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = (c & 1) !== 0 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;

  for (let i = 0; i < data.length; i++)
    c = crc_table[(c ^ data[i]) & 0xFF] ^ (c >>> 8);

  return (c ^ 0xFFFFFFFF) >>> 0;
}
