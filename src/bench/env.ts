// Bench: what this browser and machine offer (feature detection only; nothing here is assumed elsewhere).

import { measureFrameInterval } from './stats';

export async function collectEnvironment(): Promise<Record<string, unknown>> {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: { requestAdapter(): Promise<any> }; keyboard?: { lock?: unknown } };

  // The smallest step performance.now() takes (timer coarsening: 100 µs, or 5 µs when cross-origin isolated).
  let timerStep = Infinity;

  for (let i = 0, last = performance.now(); i < 20000; i++) {
    const t = performance.now();
    if (t > last) timerStep = Math.min(timerStep, t - last);
    last = t;
  }

  const gl = document.createElement('canvas').getContext('webgl2', { desynchronized: true, antialias: false }) as WebGL2RenderingContext | null;
  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');

  const webgl = gl === null ? null : {
    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    // Whether the low-latency hint was honoured (false or absent: frames go through the compositor).
    desynchronized: (gl.getContextAttributes() as WebGLContextAttributes & { desynchronized?: boolean })?.desynchronized ?? null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    timerQuery: gl.getExtension('EXT_disjoint_timer_query_webgl2') !== null,
  };

  let webgpu: unknown = null;

  try {
    const adapter = await nav.gpu?.requestAdapter();
    if (adapter) webgpu = { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, description: adapter.info?.description };
  } catch (e) {
    webgpu = { error: String(e) };
  }

  const canvas2d = document.createElement('canvas').getContext('2d', { desynchronized: true }) as CanvasRenderingContext2D & { getContextAttributes?(): { desynchronized?: boolean } };

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    devicePixelRatio: window.devicePixelRatio,
    viewport: [window.innerWidth, window.innerHeight],
    screen: [screen.width, screen.height],
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: nav.deviceMemory ?? null,
    frameIntervalMs: await measureFrameInterval(),
    timerStepMs: timerStep,
    crossOriginIsolated: self.crossOriginIsolated,
    webgl,
    webgpu,
    canvas2dDesynchronized: canvas2d.getContextAttributes?.().desynchronized ?? null,
    features: {
      pointerrawupdate: 'onpointerrawupdate' in window,
      getCoalescedEvents: 'getCoalescedEvents' in PointerEvent.prototype,
      getPredictedEvents: 'getPredictedEvents' in PointerEvent.prototype,
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      audioWorklet: typeof AudioWorkletNode !== 'undefined',
      eventTiming: PerformanceObserver.supportedEntryTypes?.includes('event') ?? false,
      longAnimationFrames: PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ?? false,
      keyboardLock: typeof nav.keyboard?.lock === 'function',
      schedulerPostTask: typeof (globalThis as { scheduler?: { postTask?: unknown } }).scheduler?.postTask === 'function',
    },
  };
}
