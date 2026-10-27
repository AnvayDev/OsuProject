import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { remuxAviToMp4, splitAnnexB } from '@game/screens/backgrounds/AviRemuxer';

// Fixtures: 2 s of ffmpeg's testsrc at 25 fps, H.264 in AVI (libx264, -g 25), with up to 3 B-frames and without.
const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.resolve('tests/fixtures/video', name)));

/** Finds a box's payload (after its header) by walking the given container path. */
function findBox(data: Uint8Array, boxPath: string[]): DataView {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let start = 0, end = data.length;

  for (const name of boxPath) {
    let pos = start;
    let found = false;

    while (pos + 8 <= end) {
      const size = view.getUint32(pos);
      const type = String.fromCharCode(...data.subarray(pos + 4, pos + 8));

      if (type === name) {
        start = pos + 8;
        end = pos + size;
        found = true;
        break;
      }

      pos += size;
    }

    if (!found)
      throw new Error(`no ${name} box`);
  }

  return new DataView(data.buffer, data.byteOffset + start, end - start);
}

/** Presentation timestamps (in ms) of every sample, from stts (decode deltas) and ctts (composition offsets). */
function presentationTimes(mp4: Uint8Array): number[] {
  const stbl = ['moov', 'trak', 'mdia', 'minf', 'stbl'];
  const timescale = findBox(mp4, ['moov', 'trak', 'mdia', 'mdhd']).getUint32(12);

  const dts: number[] = [];
  const stts = findBox(mp4, [...stbl, 'stts']);
  let t = 0;
  for (let i = 0; i < stts.getUint32(4); i++) {
    for (let n = 0; n < stts.getUint32(8 + i * 8); n++) {
      dts.push(t);
      t += stts.getUint32(12 + i * 8);
    }
  }

  const offsets: number[] = [];
  try {
    const ctts = findBox(mp4, [...stbl, 'ctts']);
    for (let i = 0; i < ctts.getUint32(4); i++) {
      for (let n = 0; n < ctts.getUint32(8 + i * 8); n++)
        offsets.push(ctts.getUint32(12 + i * 8));
    }
  } catch {
    // no ctts: presentation order is decode order
  }

  return dts.map((d, i) => Math.round((d + (offsets[i] ?? 0)) / timescale * 1000));
}

describe('AviRemuxer', () => {
  it('rebuilds B-frame presentation order: every 40 ms slot from the start offset is presented exactly once, out of decode order', () => {
    const result = remuxAviToMp4(fixture('bframes.avi'))!;
    const pts = presentationTimes(new Uint8Array(result.data));

    expect(pts).toHaveLength(50);
    expect(result.startOffset).toBeGreaterThan(0);
    expect([...pts].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => Math.round(result.startOffset + i * 40)));
    // B-frames are decoded after the frames they precede
    expect(pts).not.toEqual([...pts].sort((a, b) => a - b));
  });

  it('keeps decode order (and no offset) for streams without B-frames', () => {
    const result = remuxAviToMp4(fixture('nobframes.avi'))!;
    const pts = presentationTimes(new Uint8Array(result.data));

    expect(result.startOffset).toBe(0);
    expect(pts).toEqual(Array.from({ length: 50 }, (_, i) => i * 40));
  });

  it('rejects files that are not AVI', () => {
    expect(remuxAviToMp4(new TextEncoder().encode('not a video file at all'))).toBeNull();
  });

  it('splits Annex B streams on 3- and 4-byte start codes', () => {
    const nals = splitAnnexB(new Uint8Array([0, 0, 0, 1, 0x67, 1, 2, 0, 0, 1, 0x68, 3, 0, 0, 0, 1, 0x65, 4, 5]));
    expect(nals.map(n => [...n])).toEqual([[0x67, 1, 2], [0x68, 3], [0x65, 4, 5]]);
  });
});
