// Ported from osu.Framework/Audio/BassAmplitudeProcessor.cs, with BASS's data functions reproduced exactly (measured against libbass 2.4,
// see docs/spec/main-menu.md §7.3):
// - BASS_Mixer_ChannelGetLevel(1/60 s, STEREO): per-channel peak |x| of the last 1/60 s.
// - BASS_Mixer_ChannelGetData(FFT512): |FFT(x · periodic Hann)| · 4/512 (bin 0: · 2/512) of the mono mix (L+R)/2, 256 bins.
// Both read the channel's data before its volume/pan, so the analysers tap the source ahead of the gain and panner nodes.

import { ChannelAmplitudes } from './track/ChannelAmplitudes';

const N = 512;

const hann = Float32Array.from({ length: N }, (_, n) => 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N));
const bitReverse = Uint16Array.from({ length: N }, (_, i) => {
  let r = 0;
  for (let b = 0, v = i; b < 9; b++, v >>= 1) r = (r << 1) | (v & 1);
  return r;
});
const cosTable = Float64Array.from({ length: N / 2 }, (_, k) => Math.cos(-2 * Math.PI * k / N));
const sinTable = Float64Array.from({ length: N / 2 }, (_, k) => Math.sin(-2 * Math.PI * k / N));

const re = new Float64Array(N);
const im = new Float64Array(N);

/** BASS_DATA_FFT512 of 512 mono samples: writes 256 magnitudes into output. */
export function bassFft512(samples: ArrayLike<number>, output: Float32Array): void {
  for (let i = 0; i < N; i++) {
    re[bitReverse[i]] = samples[i] * hann[i];
    im[bitReverse[i]] = 0;
  }

  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1;
    const step = N / size;

    for (let start = 0; start < N; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cosTable[k * step], s = sinTable[k * step];
        const a = start + k, b = a + half;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }

  for (let k = 0; k < N / 2; k++)
    output[k] = Math.hypot(re[k], im[k]) * (k === 0 ? 2 : 4) / N;
}

/** The sample rate BASS's FFT bins are assumed at: that of the tracks osu! plays. */
const reference_sample_rate = 44100;

/**
 * Fills `output` with the most recent samples of `source` as they would be at a rate `step` times lower (linear interpolation; both
 * end at the same instant). With a step of 1 it copies the last samples.
 */
export function resample(source: ArrayLike<number>, step: number, output: Float32Array): void {
  const last = source.length - 1;
  const count = output.length;

  for (let i = 0; i < count; i++) {
    const position = last - (count - 1 - i) * step;

    if (position <= 0) {
      output[i] = source[0];
      continue;
    }

    const index = Math.floor(position);
    const fraction = position - index;

    output[i] = index >= last ? source[last] : source[index] + (source[index + 1] - source[index]) * fraction;
  }
}

/** BASS_ChannelGetLevel: the peak |x| of the last `count` samples. */
export function peakLevel(samples: ArrayLike<number>, count: number): number {
  let peak = 0;
  for (let i = Math.max(0, samples.length - count); i < samples.length; i++)
    peak = Math.max(peak, Math.abs(samples[i]));
  return peak;
}

/** Computes and caches amplitudes for a channel whose (pre-volume) output is `source`. */
export class AmplitudeProcessor {
  /**
   * The most recent amplitude data. Note that this is updated on an ongoing basis and there is no guarantee it is in a consistent (single sample) state.
   */
  currentAmplitudes = ChannelAmplitudes.Empty;

  private readonly left: AnalyserNode;
  private readonly right: AnalyserNode;
  private readonly mono: AnalyserNode;

  private readonly sourceSamples: number;
  private readonly sourceBuffer: Float32Array<ArrayBuffer>;
  private readonly resampleStep: number;

  private readonly levelBuffer: Float32Array<ArrayBuffer>;
  private readonly monoBuffer = new Float32Array(N);
  private readonly levelSamples: number;

  constructor(source: AudioNode) {
    const context = source.context;

    const splitter = context.createChannelSplitter(2);
    source.connect(splitter);

    this.left = context.createAnalyser();
    this.right = context.createAnalyser();
    this.left.fftSize = this.right.fftSize = 1024;
    splitter.connect(this.left, 0);
    splitter.connect(this.right, 1);

    // AnalyserNode down-mixes its input to mono ((L+R)/2 for stereo), as BASS does for a combined FFT.
    this.mono = context.createAnalyser();
    source.connect(this.mono);

    // BASS takes the FFT of the channel's own samples, which for osu! tracks are at 44.1 kHz: a bin is 86 Hz wide whatever the output
    // device. The analyser sees the signal at the context's rate, which is the output device's (48 kHz on most Macs, 16 or 24 kHz for
    // Bluetooth headphones while their microphone is in use). Without a correction a 16 kHz context squeezes 0 to 6 kHz into the 200
    // bins the logo visualiser shows, and every bar has something to show. So the last 512 samples' worth of time (at 44.1 kHz) is read
    // at the context's rate and resampled.
    this.sourceSamples = Math.min(Math.ceil((N - 1) * context.sampleRate / reference_sample_rate) + 2, 32768);
    this.mono.fftSize = Math.max(N, 2 ** Math.ceil(Math.log2(this.sourceSamples)));
    this.sourceBuffer = new Float32Array(this.mono.fftSize);
    this.resampleStep = context.sampleRate / reference_sample_rate;

    this.levelBuffer = new Float32Array(1024);
    this.levelSamples = Math.round(context.sampleRate / 60);
  }

  update(active: boolean): void {
    if (!active) {
      this.currentAmplitudes = ChannelAmplitudes.Empty;
      return;
    }

    this.left.getFloatTimeDomainData(this.levelBuffer);
    const leftChannel = peakLevel(this.levelBuffer, this.levelSamples);
    this.right.getFloatTimeDomainData(this.levelBuffer);
    const rightChannel = peakLevel(this.levelBuffer, this.levelSamples);

    this.mono.getFloatTimeDomainData(this.sourceBuffer);
    resample(this.sourceBuffer, this.resampleStep, this.monoBuffer);
    const frequencyData = new Float32Array(ChannelAmplitudes.AMPLITUDES_SIZE);
    bassFft512(this.monoBuffer, frequencyData);

    this.currentAmplitudes = new ChannelAmplitudes(leftChannel, rightChannel, frequencyData);
  }
}
