// Bench helpers: summary statistics and frame sampling.

export interface Summary {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function summarise(values: ArrayLike<number>): Summary {
  const sorted = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;

  if (n === 0)
    return { n: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0, min: 0 };

  const at = (q: number) => sorted[Math.min(n - 1, Math.floor(q * n))];

  return {
    n,
    mean: round(sorted.reduce((a, b) => a + b, 0) / n),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted[n - 1]),
    min: round(sorted[0]),
  };
}

/** Least-squares line y = slope * x + intercept, and the residuals' standard deviation and largest absolute value. */
export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number; residualStd: number; residualMax: number } {
  const n = xs.length;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;

  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }

  const slope = sxy / sxx;
  const intercept = my - slope * mx;

  let ss = 0, max = 0;

  for (let i = 0; i < n; i++) {
    const r = ys[i] - (slope * xs[i] + intercept);
    ss += r * r;
    max = Math.max(max, Math.abs(r));
  }

  return { slope, intercept, residualStd: round(Math.sqrt(ss / n)), residualMax: round(max) };
}

export const nextFrame = (): Promise<number> => new Promise(resolve => requestAnimationFrame(resolve));

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** The display's frame interval in milliseconds: the median of rAF deltas. */
export async function measureFrameInterval(frames = 90): Promise<number> {
  const deltas: number[] = [];
  let last = await nextFrame();

  for (let i = 0; i < frames; i++) {
    const t = await nextFrame();
    deltas.push(t - last);
    last = t;
  }

  return summarise(deltas).p50;
}

export interface FrameRun {
  /** Our JavaScript per frame (update + draw submission), ms. */
  js: Summary;
  /** rAF to rAF, ms. */
  interval: Summary;
  /** Share of intervals longer than 1.5 frame intervals. */
  droppedPercent: number;
}

/** Runs `frame` every animation frame for `duration` ms after `warmup` ms and summarises its duration and the frame intervals. */
export async function runFrames(frame: (time: number) => void, frameInterval: number, duration = 3000, warmup = 600): Promise<FrameRun> {
  const js: number[] = [];
  const intervals: number[] = [];

  const start = performance.now();
  let last = 0;

  for (;;) {
    const t = await nextFrame();
    const before = performance.now();
    frame(t);
    const after = performance.now();

    if (before - start > warmup) {
      js.push(after - before);
      if (last !== 0) intervals.push(t - last);
      last = t;
    }

    if (before - start > warmup + duration)
      break;
  }

  return {
    js: summarise(js),
    interval: summarise(intervals),
    droppedPercent: round(intervals.filter(i => i > frameInterval * 1.5).length / Math.max(1, intervals.length) * 100),
  };
}
