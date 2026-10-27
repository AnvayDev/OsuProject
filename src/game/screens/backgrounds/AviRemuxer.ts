// Web addition (song select video background): browsers can't play AVI, but most osu! beatmap videos are H.264 inside an AVI container
// (osu! decodes them with FFmpeg). This rewraps the H.264 stream into an MP4 without re-encoding, so a <video> element can play it:
// - AVI: RIFF chunks (hdrl/strl for the stream's frame rate and size, movi '##dc'/'##db' chunks, one per frame slot in decode order,
//   OpenDML 'AVIX' continuation RIFFs included). Empty chunks are dropped frames: they keep their time slot.
// - H.264: Annex B NAL units become length-prefixed (AVCC) samples; the first SPS/PPS form the avcC configuration.
// - AVI has no presentation timestamps, so with B-frames they're rebuilt from each picture's order count (POC, type 0; types 1 and 2 keep
//   decode order, which is presentation order for streams without B-frames). Presentation times are shifted by the reorder delay so
//   composition offsets stay non-negative; that shift is returned as `startOffset` (the time of the first frame in the MP4).

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export interface RemuxedVideo {
  readonly data: ArrayBuffer;
  /** The MP4 time (in ms) at which the video's first frame is shown. */
  readonly startOffset: number;
}

const h264_fourccs = ['H264', 'X264', 'AVC1', 'DAVC', 'VSSH'];

/** Rewraps an AVI file's H.264 video stream into an MP4. Returns null if the file isn't an AVI with an H.264 stream. */
export function remuxAviToMp4(file: Uint8Array): RemuxedVideo | null {
  const avi = parseAvi(file);

  if (avi === null || !h264_fourccs.includes(avi.compression.toUpperCase()))
    return null;

  const frames: { slot: number; nals: Uint8Array[]; key: boolean; order: number }[] = [];
  const stream = new H264Stream();

  for (let slot = 0; slot < avi.chunks.length; slot++) {
    const chunk = avi.chunks[slot];
    if (chunk.length === 0)
      continue;

    const nals = splitAnnexB(chunk);
    if (nals.length === 0)
      continue;

    const picture = stream.process(nals);
    if (picture === null)
      continue;

    frames.push({ slot, nals: picture.sampleNals, key: picture.idr, order: picture.order });
  }

  if (frames.length === 0 || stream.sps === null || stream.pps === null)
    return null;

  // presentation order: sort by (IDR period, POC); the n-th presented frame takes the n-th used time slot.
  const presented = [...frames].sort((a, b) => a.order - b.order);
  const slots = frames.map(f => f.slot);
  const ptsSlot = new Map<(typeof frames)[number], number>();
  presented.forEach((f, i) => ptsSlot.set(f, slots[i]));

  let delaySlots = 0;
  for (const f of frames)
    delaySlots = Math.max(delaySlots, f.slot - ptsSlot.get(f)!);

  const frameDuration = 1e6 * avi.scale / avi.rate; // µs

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: avi.width, height: Math.abs(avi.height) },
    fastStart: 'in-memory',
  });

  const description = buildAvcC(stream.sps, stream.pps, stream.spsInfo!);
  const codec = `avc1.${[stream.sps[1], stream.sps[2], stream.sps[3]].map(b => b.toString(16).padStart(2, '0')).join('')}`;

  frames.forEach((f, i) => {
    const dts = f.slot * frameDuration;
    const pts = (ptsSlot.get(f)! + delaySlots) * frameDuration;
    const nextSlot = i + 1 < frames.length ? frames[i + 1].slot : f.slot + 1;

    muxer.addVideoChunkRaw(toAvcc(f.nals), f.key ? 'key' : 'delta', pts, (nextSlot - f.slot) * frameDuration,
      i === 0 ? { decoderConfig: { codec, codedWidth: avi.width, codedHeight: Math.abs(avi.height), description } } : undefined,
      pts - dts);
  });

  muxer.finalize();

  return { data: muxer.target.buffer, startOffset: delaySlots * frameDuration / 1000 };
}

// #region AVI

interface AviVideoStream {
  compression: string;
  width: number;
  height: number;
  scale: number;
  rate: number;
  /** The video stream's frame chunks, in file (decode) order. */
  chunks: Uint8Array[];
}

function fourcc(data: Uint8Array, offset: number): string {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

function parseAvi(file: Uint8Array): AviVideoStream | null {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);

  if (file.length < 12 || fourcc(file, 0) !== 'RIFF' || fourcc(file, 8) !== 'AVI ')
    return null;

  let videoStreamIndex = -1;
  let streamCount = 0;
  let compression = '';
  let width = 0, height = 0, scale = 0, rate = 0;
  const chunks: Uint8Array[] = [];

  let videoChunkIds: string[] = [];

  const walk = (start: number, end: number): void => {
    let pos = start;

    while (pos + 8 <= end) {
      const id = fourcc(file, pos);
      const size = view.getUint32(pos + 4, true);
      const dataStart = pos + 8;
      const dataEnd = Math.min(dataStart + size, end);

      if (id === 'RIFF' || id === 'LIST') {
        const listType = fourcc(file, dataStart);

        if (listType === 'strl')
          streamCount++;

        walk(dataStart + 4, dataEnd);
      } else if (id === 'strh' && videoStreamIndex < 0 && fourcc(file, dataStart) === 'vids') {
        videoStreamIndex = streamCount - 1;
        scale = view.getUint32(dataStart + 20, true);
        rate = view.getUint32(dataStart + 24, true);
        const index = videoStreamIndex.toString().padStart(2, '0');
        videoChunkIds = [`${index}dc`, `${index}db`];
      } else if (id === 'strf' && videoStreamIndex === streamCount - 1 && compression === '') {
        width = view.getInt32(dataStart + 4, true);
        height = view.getInt32(dataStart + 8, true);
        compression = fourcc(file, dataStart + 16);
      } else if (videoChunkIds.includes(id)) {
        chunks.push(file.subarray(dataStart, dataEnd));
      }

      // chunks are padded to an even size
      pos = dataStart + size + (size & 1);
    }
  };

  // the first RIFF 'AVI ' and any OpenDML 'AVIX' continuations follow each other at the top level.
  walk(0, file.length);

  if (videoStreamIndex < 0 || scale === 0 || rate === 0)
    return null;

  return { compression, width, height, scale, rate, chunks };
}

// #endregion

// #region H.264

/** Splits an Annex B byte stream into NAL units (without start codes). */
export function splitAnnexB(data: Uint8Array): Uint8Array[] {
  const nals: Uint8Array[] = [];
  let start = -1;
  let i = 0;

  while (i + 2 < data.length) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      if (start >= 0)
        nals.push(trimTrailingZeros(data.subarray(start, i)));

      i += 3;
      start = i;
    } else {
      i++;
    }
  }

  if (start >= 0 && start < data.length)
    nals.push(trimTrailingZeros(data.subarray(start)));

  return nals.filter(n => n.length > 0);
}

/** (the zero byte of a 4-byte start code, and trailing_zero_8bits, end up at the end of the previous unit) */
function trimTrailingZeros(nal: Uint8Array): Uint8Array {
  let end = nal.length;
  while (end > 0 && nal[end - 1] === 0)
    end--;
  return nal.subarray(0, end);
}

function toAvcc(nals: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(nals.reduce((a, n) => a + 4 + n.length, 0));
  const view = new DataView(out.buffer);
  let pos = 0;

  for (const nal of nals) {
    view.setUint32(pos, nal.length);
    out.set(nal, pos + 4);
    pos += 4 + nal.length;
  }

  return out;
}

/** Removes emulation prevention bytes (00 00 03 → 00 00) so header fields can be read. */
function unescapeRbsp(nal: Uint8Array, maxLength = 64): Uint8Array {
  const out: number[] = [];
  let zeros = 0;

  for (let i = 0; i < nal.length && out.length < maxLength; i++) {
    const b = nal[i];

    if (zeros >= 2 && b === 3) {
      zeros = 0;
      continue;
    }

    out.push(b);
    zeros = b === 0 ? zeros + 1 : 0;
  }

  return new Uint8Array(out);
}

class BitReader {
  private bit = 0;

  constructor(private readonly data: Uint8Array) {}

  u(n: number): number {
    let v = 0;

    for (let i = 0; i < n; i++) {
      const byte = this.data[this.bit >> 3];
      if (byte === undefined)
        throw new RangeError('Read past the end of the NAL unit header.');

      v = v * 2 + ((byte >> (7 - (this.bit & 7))) & 1);
      this.bit++;
    }

    return v;
  }

  ue(): number {
    let zeros = 0;
    while (this.u(1) === 0)
      zeros++;
    return zeros === 0 ? 0 : (2 ** zeros - 1) + this.u(zeros);
  }

  se(): number {
    const k = this.ue();
    return k % 2 === 1 ? (k + 1) / 2 : -(k / 2);
  }
}

interface SpsInfo {
  chromaFormatIdc: number;
  bitDepthLumaMinus8: number;
  bitDepthChromaMinus8: number;
  separateColourPlane: boolean;
  log2MaxFrameNum: number;
  picOrderCntType: number;
  log2MaxPocLsb: number;
  frameMbsOnly: boolean;
}

const high_profiles = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135];

function parseSps(nal: Uint8Array): SpsInfo {
  const r = new BitReader(unescapeRbsp(nal, 512));
  r.u(8); // nal header
  const profileIdc = r.u(8);
  r.u(16); // constraint flags, level_idc
  r.ue(); // seq_parameter_set_id

  let chromaFormatIdc = 1, bitDepthLumaMinus8 = 0, bitDepthChromaMinus8 = 0, separateColourPlane = false;

  if (high_profiles.includes(profileIdc)) {
    chromaFormatIdc = r.ue();
    if (chromaFormatIdc === 3)
      separateColourPlane = r.u(1) === 1;
    bitDepthLumaMinus8 = r.ue();
    bitDepthChromaMinus8 = r.ue();
    r.u(1); // qpprime_y_zero_transform_bypass_flag

    if (r.u(1) === 1) { // seq_scaling_matrix_present_flag
      for (let i = 0; i < (chromaFormatIdc === 3 ? 12 : 8); i++) {
        if (r.u(1) === 0)
          continue;

        let lastScale = 8, nextScale = 8;

        for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
          if (nextScale !== 0)
            nextScale = (lastScale + r.se() + 256) % 256;
          lastScale = nextScale === 0 ? lastScale : nextScale;
        }
      }
    }
  }

  const log2MaxFrameNum = r.ue() + 4;
  const picOrderCntType = r.ue();
  let log2MaxPocLsb = 0;

  if (picOrderCntType === 0) {
    log2MaxPocLsb = r.ue() + 4;
  } else if (picOrderCntType === 1) {
    r.u(1);
    r.se();
    r.se();
    const cycle = r.ue();
    for (let i = 0; i < cycle; i++)
      r.se();
  }

  r.ue(); // max_num_ref_frames
  r.u(1); // gaps_in_frame_num_value_allowed_flag
  r.ue(); // pic_width_in_mbs_minus1
  r.ue(); // pic_height_in_map_units_minus1
  const frameMbsOnly = r.u(1) === 1;

  return { chromaFormatIdc, bitDepthLumaMinus8, bitDepthChromaMinus8, separateColourPlane, log2MaxFrameNum, picOrderCntType, log2MaxPocLsb, frameMbsOnly };
}

/** Tracks parameter sets and picture order counts across a stream's access units. */
class H264Stream {
  sps: Uint8Array | null = null;
  pps: Uint8Array | null = null;
  spsInfo: SpsInfo | null = null;

  private idrCount = 0;
  private decodeIndex = 0;
  private prevPocMsb = 0;
  private prevPocLsb = 0;

  /**
   * Processes one access unit. `order` sorts pictures into presentation order: (IDR period, POC) when POC type 0 is usable, otherwise the
   * decode order. Parameter sets and access unit delimiters are left out of the sample (they're in the avcC).
   */
  process(nals: Uint8Array[]): { sampleNals: Uint8Array[]; idr: boolean; order: number } | null {
    const sampleNals: Uint8Array[] = [];
    let idr = false;
    let poc: number | null = null;
    let hasSlice = false;

    for (const nal of nals) {
      const type = nal[0] & 0x1f;

      if (type === 7) {
        this.sps ??= nal;
        this.spsInfo ??= parseSps(nal);
        continue;
      }

      if (type === 8) {
        this.pps ??= nal;
        continue;
      }

      if (type === 9)
        continue;

      sampleNals.push(nal);

      if ((type === 1 || type === 5) && !hasSlice) {
        hasSlice = true;
        idr = type === 5;
        poc = this.readPoc(nal, type);
      }
    }

    if (!hasSlice)
      return null;

    const index = this.decodeIndex++;

    if (idr)
      this.idrCount++;

    // POC type 0 orders pictures within an IDR period; 2^20 frames per period is far beyond any beatmap video.
    const order = poc === null ? index : this.idrCount * 2 ** 32 + poc + 2 ** 20;

    return { sampleNals, idr, order };
  }

  private fallback = false;

  private readPoc(nal: Uint8Array, type: number): number | null {
    const sps = this.spsInfo;

    if (sps === null || sps.picOrderCntType !== 0 || !sps.frameMbsOnly || this.fallback) {
      // without POC type 0 the order can't be rebuilt: keep decode order everywhere so the order keys stay comparable.
      this.fallback = true;
      return null;
    }

    try {
      const r = new BitReader(unescapeRbsp(nal));
      const nalRefIdc = (r.u(8) >> 5) & 3;
      r.ue(); // first_mb_in_slice
      r.ue(); // slice_type
      r.ue(); // pic_parameter_set_id
      if (sps.separateColourPlane)
        r.u(2);
      r.u(sps.log2MaxFrameNum); // frame_num
      if (type === 5)
        r.ue(); // idr_pic_id
      const lsb = r.u(sps.log2MaxPocLsb);

      if (type === 5) {
        this.prevPocMsb = 0;
        this.prevPocLsb = 0;
      }

      const maxLsb = 2 ** sps.log2MaxPocLsb;
      let msb = this.prevPocMsb;

      if (lsb < this.prevPocLsb && this.prevPocLsb - lsb >= maxLsb / 2)
        msb += maxLsb;
      else if (lsb > this.prevPocLsb && lsb - this.prevPocLsb > maxLsb / 2)
        msb -= maxLsb;

      if (nalRefIdc !== 0) {
        this.prevPocMsb = msb;
        this.prevPocLsb = lsb;
      }

      return msb + lsb;
    } catch {
      this.fallback = true;
      return null;
    }
  }
}

function buildAvcC(sps: Uint8Array, pps: Uint8Array, info: SpsInfo): Uint8Array {
  const highProfile = high_profiles.includes(sps[1]);
  const out = new Uint8Array(11 + sps.length + pps.length + (highProfile ? 4 : 0));
  const view = new DataView(out.buffer);

  out[0] = 1; // configurationVersion
  out[1] = sps[1]; // AVCProfileIndication
  out[2] = sps[2]; // profile_compatibility
  out[3] = sps[3]; // AVCLevelIndication
  out[4] = 0xff; // lengthSizeMinusOne = 3
  out[5] = 0xe1; // one SPS
  view.setUint16(6, sps.length);
  out.set(sps, 8);
  out[8 + sps.length] = 1; // one PPS
  view.setUint16(9 + sps.length, pps.length);
  out.set(pps, 11 + sps.length);

  if (highProfile) {
    const p = 11 + sps.length + pps.length;
    out[p] = 0xfc | info.chromaFormatIdc;
    out[p + 1] = 0xf8 | info.bitDepthLumaMinus8;
    out[p + 2] = 0xf8 | info.bitDepthChromaMinus8;
    out[p + 3] = 0; // numOfSequenceParameterSetExt
  }

  return out;
}

// #endregion
