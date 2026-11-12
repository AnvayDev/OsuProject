// Bench: the audio numbers a rhythm game depends on (stages A1 and A2 of docs/GAMEPLAY-PLAN.md §2).
//  1. What the AudioContext reports: sample rate, baseLatency, outputLatency (which includes a Bluetooth device's delay).
//  2. How steadily each candidate clock advances when read once per frame: AudioContext.currentTime, getOutputTimestamp(), and an
//     HTMLAudioElement's currentTime.
//  3. Whether an HTMLAudioElement's currentTime tells the truth about the audio it is feeding into the graph: a file with a click every
//     second is played through the element, an AudioWorklet reports the context time at which each click actually passes, and that is
//     compared with what the element's clock claimed at that moment. The same check with an AudioBufferSourceNode validates the method
//     (its error must be about zero, since its samples are scheduled on the context's own timeline).
// Everything plays at zero gain: nothing is audible.

import { linearFit, nextFrame, summarise, type Summary } from './stats';

const CLICK_TIMES = [1, 2, 3, 4, 5];
const DURATION = 6;

function clickSamples(sampleRate: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(sampleRate * DURATION);
  for (const t of CLICK_TIMES)
    samples[Math.round(t * sampleRate)] = 1;
  return samples;
}

function wavBlob(samples: Float32Array<ArrayBuffer>, sampleRate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };

  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++)
    view.setInt16(44 + i * 2, Math.round(samples[i] * 32767), true);

  return new Blob([view], { type: 'audio/wav' });
}

/** An AudioWorklet that reports the context time (in seconds) of every sample louder than 0.5, and passes its input through. */
const detectorModule = URL.createObjectURL(new Blob([`
  registerProcessor('click-detector', class extends AudioWorkletProcessor {
    process(inputs, outputs) {
      const input = inputs[0][0];
      if (input) {
        for (let i = 0; i < input.length; i++) {
          if (Math.abs(input[i]) > 0.5) this.port.postMessage((currentFrame + i) / sampleRate);
        }
        outputs[0][0]?.set(input);
      }
      return true;
    }
  });`], { type: 'text/javascript' }));

interface ClockSamples { perf: number[]; value: number[] }

function describeClock(samples: ClockSamples): { ratePerMs: number; jitterStdMs: number; jitterMaxMs: number; stepMs: Summary; unchangedReadsPercent: number } {
  const fit = linearFit(samples.perf, samples.value.map(v => v * 1000));
  const steps: number[] = [];
  let unchanged = 0;

  for (let i = 1; i < samples.value.length; i++) {
    const step = (samples.value[i] - samples.value[i - 1]) * 1000;
    if (step === 0) unchanged++;
    else steps.push(step);
  }

  return {
    // (1 means the clock advances one millisecond per millisecond of performance.now())
    ratePerMs: Math.round(fit.slope * 1e6) / 1e6,
    // How far single reads are from a straight line: what a frame would be off by if it trusted one read.
    jitterStdMs: fit.residualStd,
    jitterMaxMs: fit.residualMax,
    stepMs: summarise(steps),
    unchangedReadsPercent: Math.round(unchanged / Math.max(1, samples.value.length - 1) * 1000) / 10,
  };
}

export async function probeAudio(status: (text: string) => void): Promise<Record<string, unknown>> {
  const context = new AudioContext({ latencyHint: 'interactive' });
  await context.resume();

  const result: Record<string, unknown> = {
    sampleRate: context.sampleRate,
    baseLatencyMs: Math.round(context.baseLatency * 100000) / 100,
    state: context.state,
  };

  const silent = context.createGain();
  silent.gain.value = 0;
  silent.connect(context.destination);

  let detectorAvailable = true;

  try {
    await context.audioWorklet.addModule(detectorModule);
  } catch (e) {
    detectorAvailable = false;
    result.workletError = String(e);
  }

  const samples = clickSamples(context.sampleRate);

  // --- AudioBufferSourceNode: clicks scheduled on the context's timeline ---
  status('audio: buffer source');

  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);

  const bufferClicks: number[] = [];
  const source = context.createBufferSource();
  source.buffer = buffer;

  if (detectorAvailable) {
    const detector = new AudioWorkletNode(context, 'click-detector');
    detector.port.onmessage = e => bufferClicks.push(e.data as number);
    source.connect(detector).connect(silent);
  } else
    source.connect(silent);

  const startTime = context.currentTime + 0.1;
  source.start(startTime);

  const contextClock: ClockSamples = { perf: [], value: [] };
  const outputClock: ClockSamples = { perf: [], value: [] };
  const outputLatencies: number[] = [];

  while (context.currentTime < startTime + DURATION) {
    await nextFrame();
    const now = performance.now();

    contextClock.perf.push(now);
    contextClock.value.push(context.currentTime);

    const stamp = context.getOutputTimestamp?.();

    if (stamp?.performanceTime) {
      // The context time that is leaving the device right now, extrapolated from the browser's last (contextTime, performanceTime) pair.
      outputClock.perf.push(now);
      outputClock.value.push(stamp.contextTime! + (now - stamp.performanceTime) / 1000);
    }

    if (typeof context.outputLatency === 'number')
      outputLatencies.push(context.outputLatency * 1000);
  }

  result.outputLatencyMs = outputLatencies.length ? summarise(outputLatencies) : null;
  result.contextCurrentTime = describeClock(contextClock);
  result.getOutputTimestamp = outputClock.perf.length > 10 ? describeClock(outputClock) : null;

  if (outputClock.perf.length > 10) {
    // How far the "leaving the device" clock runs behind the "being rendered" clock: the output delay as getOutputTimestamp sees it.
    const rendered = linearFit(contextClock.perf, contextClock.value.map(v => v * 1000));
    const heard = linearFit(outputClock.perf, outputClock.value.map(v => v * 1000));
    const at = contextClock.perf[contextClock.perf.length >> 1];
    result.renderedMinusOutputMs = Math.round(((rendered.slope * at + rendered.intercept) - (heard.slope * at + heard.intercept)) * 100) / 100;
  }

  if (detectorAvailable) {
    // (expected: 0 within a sample; anything else means the measurement itself is off)
    result.bufferSourceClickErrorMs = summarise(bufferClicks.map((t, i) => (t - (startTime + CLICK_TIMES[i])) * 1000));
  }

  // --- HTMLAudioElement through a MediaElementAudioSourceNode (how tracks are played today) ---
  status('audio: media element');

  const element = new Audio(URL.createObjectURL(wavBlob(samples, context.sampleRate)));
  element.preload = 'auto';

  const elementSource = context.createMediaElementSource(element);
  const elementClicks: number[] = [];

  if (detectorAvailable) {
    const detector = new AudioWorkletNode(context, 'click-detector');
    detector.port.onmessage = e => elementClicks.push(e.data as number);
    elementSource.connect(detector).connect(silent);
  } else
    elementSource.connect(silent);

  await element.play();

  const elementClock: ClockSamples = { perf: [], value: [] };
  const contextDuringElement: ClockSamples = { perf: [], value: [] };

  while (!element.ended && element.currentTime < DURATION - 0.3) {
    await nextFrame();
    const now = performance.now();
    elementClock.perf.push(now);
    elementClock.value.push(element.currentTime);
    contextDuringElement.perf.push(now);
    contextDuringElement.value.push(context.currentTime);
  }

  element.pause();

  result.mediaElementCurrentTime = describeClock(elementClock);

  if (detectorAvailable && elementClicks.length > 0) {
    // For each click: the moment (performance.now) it passed through the graph, and what the element's clock claimed at that moment.
    const contextFit = linearFit(contextDuringElement.value.map(v => v * 1000), contextDuringElement.perf);
    const elementFit = linearFit(elementClock.perf, elementClock.value.map(v => v * 1000));

    const errors = elementClicks.map((contextTime, i) => {
      const passedAt = contextFit.slope * contextTime * 1000 + contextFit.intercept;
      const claimed = elementFit.slope * passedAt + elementFit.intercept;
      return claimed - CLICK_TIMES[i] * 1000;
    });

    // Positive: the element's clock is ahead of the audio it delivers (visuals following it would run early against the sound).
    result.mediaElementClockAheadOfAudioMs = summarise(errors);
  }

  await context.close();
  return result;
}
