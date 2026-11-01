// Web addition (song select video background): osu! plays every storyboard video format through FFmpeg, but browsers only decode a few
// codecs (H.264, VP8/VP9, AV1). Videos AviRemuxer can't rewrap (FLV, WMV, MPEG-1/2, Xvid/DivX AVIs, MPEG-4 Part 2 in MP4) are converted
// with FFmpeg compiled to WebAssembly (ffmpeg.wasm, loaded on first use: the core is ~32 MB). H.264 streams are only rewrapped into MP4;
// anything else is re-encoded to H.264 at its own resolution and frame timing, with x264 "superfast" at CRF 16 (visually lossless; the
// faster "ultrafast" preset has no deblocking filter, which shows as blocking). Only the newest conversion runs: starting one cancels the
// one in progress (the user moved on to another beatmap).

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

/** The converted file, or why there is none: FFmpeg couldn't convert it, or a newer conversion replaced this one. */
export type TranscodeResult = Uint8Array | 'failed' | 'cancelled';

const encode_arguments = [
  '-c:v', 'libx264', '-preset', 'superfast', '-crf', '16', '-pix_fmt', 'yuv420p',
  // (4:2:0 needs even dimensions: an odd edge loses its last pixel row/column, nothing is rescaled)
  '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2',
];

let ffmpeg: Promise<FFmpeg> | null = null;
let latest = 0;
let running = false;

function loadFFmpeg(): Promise<FFmpeg> {
  return ffmpeg ??= (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const instance = new FFmpeg();
    await instance.load({ coreURL, wasmURL });
    return instance;
  })();
}

/** Converts a video file into an MP4 a <video> element can play. */
export async function transcodeToMp4(data: Uint8Array, extension: string): Promise<TranscodeResult> {
  const id = ++latest;

  // (a running conversion can't be interrupted, so its worker is terminated and a fresh FFmpeg loaded)
  if (running && ffmpeg !== null) {
    void ffmpeg.then(f => f.terminate(), () => {});
    ffmpeg = null;
  }

  running = true;

  let ff: FFmpeg;

  try {
    ff = await loadFFmpeg();
  } catch {
    if (id !== latest)
      return 'cancelled';

    // (loading is retried by the next conversion)
    running = false;
    ffmpeg = null;
    return 'failed';
  }

  const input = `input${extension}`;

  try {
    await ff.writeFile(input, data);

    const convert = (args: string[]) => ff.exec(['-i', input, '-map', '0:v:0', '-an', '-sn', ...args, '-y', 'output.mp4']);

    // (AVI has no presentation timestamps, so copying an H.264 stream with B-frames out of one can fail: re-encode then)
    const copied = await probeVideoCodec(ff, input) === 'h264' && await convert(['-c:v', 'copy']) === 0;

    if (!copied && await convert(encode_arguments) !== 0)
      return id === latest ? 'failed' : 'cancelled';

    const output = await ff.readFile('output.mp4');
    return output instanceof Uint8Array ? output : 'failed';
  } catch {
    // (FFmpeg's worker was terminated by a newer conversion, or failed)
    return id === latest ? 'failed' : 'cancelled';
  } finally {
    if (id === latest) {
      running = false;
      await Promise.allSettled([ff.deleteFile(input), ff.deleteFile('output.mp4'), ff.deleteFile('probe.txt')]);
    }
  }
}

/** The codec name of the file's first video stream (FFprobe's codec_name). */
async function probeVideoCodec(ff: FFmpeg, input: string): Promise<string | null> {
  // (the wasm build's ffprobe exits with -1 even when it succeeds, so only its output tells)
  await ff.ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', input, '-o', 'probe.txt']);

  const output = await ff.readFile('probe.txt', 'utf8').catch(() => null);
  return typeof output === 'string' && output.trim() !== '' ? output.trim() : null;
}

/** Codecs (MP4 sample entry types) browsers decode natively. */
const native_sample_entries = ['avc1', 'avc3', 'vp08', 'vp09', 'av01'];

/** Boxes on the path from the file to a track's sample descriptions (moov/trak/mdia/minf/stbl/stsd). */
const sample_description_path = ['moov', 'trak', 'mdia', 'minf', 'stbl'];

/** Whether an MP4/MOV file has a video track in a codec browsers decode (MPEG-4 Part 2 and other older codecs need converting). */
export function isNativelyPlayableMp4(data: Uint8Array): boolean {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const fourcc = (offset: number) => String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);

  const search = (start: number, end: number): boolean => {
    for (let offset = start; offset + 8 <= end;) {
      const type = fourcc(offset + 4);
      let size = view.getUint32(offset);
      let header = 8;

      if (size === 1) {
        if (offset + 16 > end)
          return false;

        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset; // (extends to the end of the file)
      }

      if (size < header || offset + size > end)
        return false;

      // a sample description: version and flags, entry count, then the first entry's size and type (its codec)
      if (type === 'stsd' && size >= header + 16 && native_sample_entries.includes(fourcc(offset + header + 12)))
        return true;

      if (sample_description_path.includes(type) && search(offset + header, offset + size))
        return true;

      offset += size;
    }

    return false;
  };

  return search(0, data.length);
}
