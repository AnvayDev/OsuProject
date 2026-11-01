// Web addition (song select video background): osu! plays every storyboard video format through FFmpeg, but browsers only decode a few
// codecs (H.264, VP8/VP9, AV1). Videos AviRemuxer can't rewrap (FLV, WMV, MPEG-1/2, Xvid/DivX AVIs, MPEG-4 Part 2 in MP4) are converted
// with FFmpeg compiled to WebAssembly (ffmpeg.wasm, loaded on first use: the core is ~32 MB). H.264 streams are only rewrapped into MP4;
// anything else is re-encoded to H.264 (x264 "ultrafast", the fastest encoder in the build), at most 720 lines high to keep conversion time
// reasonable. Only the newest conversion runs: starting one cancels the one in progress (the user moved on to another beatmap).

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

let ffmpeg: Promise<FFmpeg> | null = null;
let latest = 0;
let running: number | null = null;

function loadFFmpeg(): Promise<FFmpeg> {
  return ffmpeg ??= (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const instance = new FFmpeg();
    await instance.load({ coreURL, wasmURL });
    return instance;
  })();
}

/** Converts a video file into an MP4 a <video> element can play. Resolves null if conversion fails or a newer conversion replaces it. */
export async function transcodeToMp4(data: Uint8Array, extension: string): Promise<Uint8Array | null> {
  const id = ++latest;

  // (a running conversion can't be interrupted, so its worker is terminated and a fresh FFmpeg loaded)
  if (running !== null && ffmpeg !== null) {
    void ffmpeg.then(f => f.terminate(), () => {});
    ffmpeg = null;
  }

  running = id;

  try {
    const ff = await loadFFmpeg();
    if (id !== latest)
      return null;

    const input = `input${extension}`;
    await ff.writeFile(input, data);

    const convert = (args: string[]) => ff.exec(['-i', input, '-map', '0:v:0', '-an', '-sn', ...args, '-y', 'output.mp4']);

    // (AVI has no presentation timestamps, so copying an H.264 stream with B-frames out of one can fail: re-encode then)
    const copied = await probeVideoCodec(ff, input) === 'h264' && await convert(['-c:v', 'copy']) === 0;

    if (!copied && await convert(['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-vf', 'scale=-2:min(720\\,trunc(ih/2)*2)']) !== 0)
      return null;

    const output = await ff.readFile('output.mp4');
    await Promise.all([ff.deleteFile(input), ff.deleteFile('output.mp4')]);

    return id === latest && output instanceof Uint8Array ? output : null;
  } catch {
    // (terminated by a newer conversion, or FFmpeg failed to load)
    return null;
  } finally {
    if (running === id)
      running = null;
  }
}

/** The codec name FFmpeg reports for the file's first video stream. */
async function probeVideoCodec(ff: FFmpeg, input: string): Promise<string | null> {
  let codec: string | null = null;

  const onLog = ({ message }: { message: string }) => {
    codec ??= /Stream #\d+:\d+.*?: Video: (\w+)/.exec(message)?.[1] ?? null;
  };

  ff.on('log', onLog);
  // (with no output file FFmpeg prints the input's streams and exits with an error)
  await ff.exec(['-hide_banner', '-i', input]);
  ff.off('log', onLog);

  return codec;
}

/** Codecs (MP4 sample entry types) browsers decode natively. */
const native_sample_entries = ['avc1', 'avc3', 'vp08', 'vp09', 'av01'];

/** Whether an MP4/MOV file's video track uses a codec browsers play (MPEG-4 Part 2 and other older codecs need converting). */
export function isNativelyPlayableMp4(data: Uint8Array): boolean {
  const text = (offset: number) => String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);

  // every track's sample description ('stsd' box): its first sample entry names the track's codec.
  for (let i = 4; i + 20 <= data.length; i++) {
    if (data[i] === 0x73 && text(i) === 'stsd' && native_sample_entries.includes(text(i + 16)))
      return true;
  }

  return false;
}
