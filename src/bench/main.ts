// The measurement page (bench.html): see docs/GAMEPLAY-PLAN.md §2 for what each number means and which decision it informs.
// `?auto=1` runs without the interactive input probes and leaves the result on window.__benchResult (used for cloud runs, whose
// software GL and null audio device make absolute values meaningless: compare variants with each other only).

import { probeAudio } from './audioProbe';
import { collectEnvironment } from './env';
import { probeInput } from './inputProbe';
import { createCanvas2D, createWebGL2, createWebGPU, QUADS_PER_DENSITY, type RawBackend } from './rawBackends';
import { runScene } from './sceneBench';
import { runFrames, sleep, summarise } from './stats';

const params = new URLSearchParams(location.search);
const auto = params.get('auto') === '1';
const duration = Number(params.get('duration') ?? 3000);

const stage = document.getElementById('stage')!;
const statusElement = document.getElementById('status')!;
const promptElement = document.getElementById('prompt')!;
const output = document.getElementById('output') as HTMLTextAreaElement;
const runButton = document.getElementById('run') as HTMLButtonElement;
const copyButton = document.getElementById('copy') as HTMLButtonElement;

const status = (text: string) => {
  statusElement.style.display = 'block';
  statusElement.textContent = text;
};

function rawCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'raw';
  canvas.width = Math.round(stage.clientWidth * devicePixelRatio);
  canvas.height = Math.round(stage.clientHeight * devicePixelRatio);
  stage.replaceChildren(canvas);
  return canvas;
}

async function runRaw(name: string, create: (canvas: HTMLCanvasElement, count: number) => RawBackend | null | Promise<RawBackend | null>, density: number, frameInterval: number) {
  status(`${name} x${density}`);

  const backend = await create(rawCanvas(), density * QUADS_PER_DENSITY);

  if (backend === null)
    return { unavailable: true };

  const run = await runFrames(t => backend.draw(t), frameInterval, duration);
  backend.dispose();
  stage.replaceChildren();
  await sleep(100);

  return { quads: density * QUADS_PER_DENSITY, ...run };
}

function runWorker(density: number, frameInterval: number): Promise<unknown> {
  status(`raw-webgl2-worker x${density}`);

  return new Promise(resolve => {
    const canvas = rawCanvas();
    const worker = new Worker(new URL('./rawWorker.ts', import.meta.url), { type: 'module' });
    const offscreen = canvas.transferControlToOffscreen();

    // Messages posted like forwarded input events would be, to see how late the worker receives them.
    const ping = setInterval(() => worker.postMessage({ type: 'ping', sent: performance.timeOrigin + performance.now() }), 7);

    worker.onmessage = (e: MessageEvent<{ js: number[]; intervals: number[]; messageDelays: number[] }>) => {
      clearInterval(ping);
      worker.terminate();
      stage.replaceChildren();

      resolve({
        quads: density * QUADS_PER_DENSITY,
        js: summarise(e.data.js),
        interval: summarise(e.data.intervals),
        droppedPercent: Math.round(e.data.intervals.filter(i => i > frameInterval * 1.5).length / Math.max(1, e.data.intervals.length) * 100000) / 1000,
        // main thread → worker message delay: what forwarding input to a worker-side game would add.
        messageDelay: summarise(e.data.messageDelays),
      });
    };

    worker.onerror = e => {
      clearInterval(ping);
      resolve({ error: e.message });
    };

    worker.postMessage({ type: 'start', canvas: offscreen, count: density * QUADS_PER_DENSITY, duration, warmup: 600 }, [offscreen]);
  });
}

async function runInputProbe(label: string): Promise<unknown> {
  promptElement.style.display = 'flex';
  promptElement.textContent = 'Move the mouse and tap Z and X as if you were playing';
  const result = await probeInput(8000, text => status(`${label}: ${text}`));
  promptElement.style.display = 'none';
  return result;
}

async function runAll(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { version: 1, date: new Date().toISOString() };

  const guard = async (name: string, run: () => Promise<unknown>) => {
    try {
      result[name] = await run();
    } catch (e) {
      result[name] = { error: String((e as Error)?.stack ?? e) };
    }
  };

  // (first, while the click that started the run still counts as a user gesture for audio)
  await guard('audio', () => probeAudio(status));

  status('environment');
  await guard('environment', collectEnvironment);

  const frameInterval = (result.environment as { frameIntervalMs?: number })?.frameIntervalMs ?? 16.67;

  stage.style.display = 'block';

  const render: Record<string, unknown> = {};
  result.render = render;

  const guardRender = async (name: string, run: () => Promise<unknown>) => {
    try {
      render[name] = await run();
    } catch (e) {
      render[name] = { error: String((e as Error)?.stack ?? e) };
      stage.replaceChildren();
    }
  };

  for (const density of [1, 4]) {
    status(`scene-dom x${density}`);
    await guardRender(`scene-dom x${density}`, () => runScene(stage, false, density, frameInterval, duration));
    status(`scene-webgl2 x${density}`);
    await guardRender(`scene-webgl2 x${density}`, () => runScene(stage, true, density, frameInterval, duration));
  }

  for (const density of [1, 4, 16]) {
    await guardRender(`raw-canvas2d x${density}`, () => runRaw('raw-canvas2d', createCanvas2D, density, frameInterval));
    await guardRender(`raw-webgl2 x${density}`, () => runRaw('raw-webgl2', createWebGL2, density, frameInterval));
    await guardRender(`raw-webgpu x${density}`, () => runRaw('raw-webgpu', createWebGPU, density, frameInterval));
    await guardRender(`raw-webgl2-worker x${density}`, () => runWorker(density, frameInterval));
  }

  if (!auto) {
    await guard('inputIdle', () => runInputProbe('input, idle page'));

    // The same probe while a playfield's worth of scene graph is being updated and drawn on the main thread.
    await guard('inputUnderLoad', async () => {
      const [input] = await Promise.all([runInputProbe('input, playfield running'), runScene(stage, true, 1, frameInterval, 8500, 0)]);
      return input;
    });
  }

  stage.style.display = 'none';
  statusElement.style.display = 'none';

  return result;
}

async function start(): Promise<void> {
  runButton.disabled = true;

  const result = await runAll();

  output.value = JSON.stringify(result, null, 1);
  copyButton.disabled = false;
  runButton.disabled = false;
  (window as unknown as { __benchResult: unknown }).__benchResult = result;
}

runButton.addEventListener('click', () => void start());

copyButton.addEventListener('click', () => {
  void navigator.clipboard.writeText(output.value);
  copyButton.textContent = 'Copied';
});

if (auto)
  void start();
