// Ported from osu.Framework/Extensions/ExtensionMethods.cs (the hashing and path helpers). SHA-256 comes from WebCrypto, which is asynchronous;
// WebCrypto has no MD5, so it is implemented here (RFC 1321).

const utf8 = new TextEncoder();

const toBytes = (data: Uint8Array | string): Uint8Array => typeof data === 'string' ? utf8.encode(data) : data;

const toHexLower = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/** Gets a SHA-2 (256bit) hash for the given data (a string is hashed as UTF-8). Returns a lower-case hex string representation of the hash (64 characters). */
export async function computeSHA2Hash(data: Uint8Array | string): Promise<string> {
  return toHexLower(new Uint8Array(await crypto.subtle.digest('SHA-256', toBytes(data) as Uint8Array<ArrayBuffer>)));
}

/** Gets an MD5 hash for the given data (a string is hashed as UTF-8). Returns a lower-case hex string representation of the hash (32 characters). */
export function computeMD5Hash(data: Uint8Array | string): string {
  return toHexLower(md5(toBytes(data)));
}

/** Standardise the path string using '/' as directory separator. */
export function toStandardisedPath(path: string): string {
  return path.replaceAll('\\', '/');
}

const md5_shifts = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

const md5_constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

function md5(message: Uint8Array): Uint8Array {
  const paddedLength = ((message.length + 8) >>> 6) + 1 << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = message.length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 2 ** 32), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const m = new Uint32Array(16);

  for (let chunk = 0; chunk < paddedLength; chunk += 64) {
    for (let i = 0; i < 16; i++)
      m[i] = view.getUint32(chunk + i * 4, true);

    let a = a0, b = b0, c = c0, d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number, g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const sum = (a + f + md5_constants[i] + m[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << md5_shifts[i]) | (sum >>> (32 - md5_shifts[i])))) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => outView.setUint32(i * 4, v, true));
  return out;
}
