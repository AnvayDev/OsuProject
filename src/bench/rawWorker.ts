// Bench worker: the raw WebGL2 backend on an OffscreenCanvas, driven by the worker's own requestAnimationFrame. It also measures how long
// messages from the main thread take to arrive, which is the delay an input-forwarding design would add to every key press.

import { createWebGL2 } from './rawBackends';

interface StartMessage { type: 'start'; canvas: OffscreenCanvas; count: number; duration: number; warmup: number }
interface PingMessage { type: 'ping'; sent: number }

const now = () => performance.timeOrigin + performance.now();

const messageDelays: number[] = [];

self.onmessage = (e: MessageEvent<StartMessage | PingMessage>) => {
  if (e.data.type === 'ping') {
    messageDelays.push(now() - e.data.sent);
    return;
  }

  const { canvas, count, duration, warmup } = e.data;
  const backend = createWebGL2(canvas, count);

  const js: number[] = [];
  const intervals: number[] = [];
  const start = performance.now();
  let last = 0;

  const frame = (t: number) => {
    const before = performance.now();
    backend.draw(t);
    const after = performance.now();

    if (before - start > warmup) {
      js.push(after - before);
      if (last !== 0) intervals.push(t - last);
      last = t;
    }

    if (before - start > warmup + duration) {
      backend.dispose();
      (self as unknown as Worker).postMessage({ js, intervals, messageDelays });
      return;
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
};
