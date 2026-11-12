// Per-frame cost of a named app state, measured in headless Chromium against the dev server.
// usage: node scripts/perf.mjs --state songselect [--scroll 1] [--frames 240] [--profile 1] [--top 40] [--eval "..."] [--url ...]
//        [--cpu 4] (CDP CPU throttling factor) [--json out.json]
// Reports, per frame: our JavaScript (update, draw) from GameHost, the frame interval, and the browser's own script/style/layout time
// from CDP Performance metrics. With --profile, also the functions with the most self time (V8 sampling profiler, 100 µs interval).
// Cloud Chromium has no GPU: compare runs with each other only (docs/GAMEPLAY-PLAN.md §2).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]] : acc), []),
);
const url = args.url ?? 'http://127.0.0.1:5173/';
const frames = Number(args.frames ?? 240);
const top = Number(args.top ?? 40);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: Number(args.w ?? 1389), height: Number(args.h ?? 868) }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__osu && window.__osu.ready, null, { timeout: 30000 });
await page.evaluate(() => window.__osu.ready);
if (args.state) await page.evaluate((s) => window.__osu.goto(s), args.state);
await page.waitForTimeout(Number(args.wait ?? 4000));
if (args.eval) await page.evaluate(`(async () => { ${args.eval} })()`);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
if (args.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(args.cpu) });

const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

if (args.profile) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
}

// Wheel events while sampling (the mouse is placed where the state's scrollable content is).
let scrolling = null;

if (args.scroll) {
  await page.mouse.move(Number(args.x ?? 700), Number(args.y ?? 500));
  let direction = 1, n = 0;
  scrolling = setInterval(() => {
    if (++n % 40 === 0) direction = -direction;
    page.mouse.wheel(0, direction * Number(args.delta ?? 120)).catch(() => {});
  }, 50);
}

if (args.move) {
  let n = 0;
  scrolling = setInterval(() => {
    n++;
    page.mouse.move(300 + 400 * (1 + Math.sin(n / 7)), 250 + 200 * (1 + Math.cos(n / 5))).catch(() => {});
  }, 16);
}

// --trace: time per frame by timeline event (main thread: style, layout, pre-paint, paint, layerize, commit; and raster tasks).
const traceEvents = [];

if (args.trace) {
  cdp.on('Tracing.dataCollected', (e) => traceEvents.push(...e.value));
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'cc', 'gpu', 'blink'] } });
}

const before = await metrics();

const samples = await page.evaluate((count) => new Promise((resolve) => {
  const host = window.__osu.game.host;
  const out = { update: [], draw: [], interval: [], drawables: 0 };
  let last = 0, lastStart = 0;

  const tick = (t) => {
    if (host.lastFrameStart !== lastStart) {
      out.update.push(host.lastUpdateDuration);
      out.draw.push(host.lastDrawDuration);
      if (last) out.interval.push(t - last);
      last = t;
      lastStart = host.lastFrameStart;
    }

    if (out.update.length >= count) {
      const walk = (d) => 1 + (d.internalChildren ?? []).reduce((a, c) => a + walk(c), 0);
      out.drawables = walk(window.__osu.game);
      out.elements = document.querySelectorAll('*').length;
      resolve(out);
    } else
      requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}), frames);

const after = await metrics();
if (scrolling) clearInterval(scrolling);

const summarise = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (x) => Math.round(x * 100) / 100;
  return { mean: r(v.reduce((a, b) => a + b, 0) / v.length), p50: r(q(0.5)), p95: r(q(0.95)), max: r(s[s.length - 1]) };
};

const n = samples.update.length;
const perFrame = (name) => Math.round((after[name] - before[name]) / n * 100000) / 100;

const result = {
  state: args.state, scroll: !!args.scroll, frames: n, drawables: samples.drawables, elements: samples.elements,
  updateMs: summarise(samples.update),
  drawMs: summarise(samples.draw),
  totalMs: summarise(samples.update.map((u, i) => u + samples.draw[i])),
  intervalMs: summarise(samples.interval),
  // Browser totals per frame (ms): all script, style recalculation, layout, and the whole main-thread task time.
  browserPerFrameMs: { script: perFrame('ScriptDuration'), style: perFrame('RecalcStyleDuration'), layout: perFrame('LayoutDuration'), task: perFrame('TaskDuration') },
  styleRecalcsPerFrame: Math.round((after.RecalcStyleCount - before.RecalcStyleCount) / n * 100) / 100,
  heapMB: Math.round(after.JSHeapUsedSize / 1e5) / 10,
};

console.log(JSON.stringify(result, null, 1));

if (args.trace) {
  const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await done;

  const names = ['RunTask', 'FireAnimationFrame', 'FunctionCall', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'PaintImage', 'Layerize', 'Commit', 'UpdateLayer',
    'CompositeLayers', 'RasterTask', 'ImageDecodeTask', 'Decode Image', 'Decode LazyPixelRef', 'MinorGC', 'MajorGC', 'V8.GC_SCAVENGER', 'V8.GC_MARK_COMPACTOR', 'GPUTask', 'HitTest', 'EventDispatch',
    'LayerTreeHostImpl::PrepareToDraw', 'DisplayItemList::Finalize', 'PaintArtifactCompositor::Update', 'LocalFrameView::RunPaintLifecyclePhase', 'ProxyImpl::ScheduledActionDraw', 'Graphics.Pipeline.DrawAndSwap', 'viz::Display::DrawAndSwap'];
  const sums = new Map();

  for (const e of traceEvents) {
    if (e.ph !== 'X' || !names.includes(e.name)) continue;
    const entry = sums.get(e.name) ?? { time: 0, count: 0 };
    entry.time += e.dur ?? 0;
    entry.count++;
    sums.set(e.name, entry);
  }

  console.log('\ntrace, per frame (nested events overlap; RunTask spans all threads):');
  for (const name of names) {
    const entry = sums.get(name);
    if (entry) console.log(`${(entry.time / 1000 / n).toFixed(3).padStart(8)} ms  ${(entry.count / n).toFixed(1).padStart(6)} x  ${name}`);
  }

  if (args.tracejson) writeFileSync(args.tracejson, JSON.stringify(traceEvents));
}

if (args.profile) {
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const total = profile.timeDeltas.reduce((a, b) => a + b, 0);
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));

  profile.samples.forEach((id, i) => {
    const node = byId.get(id);
    const f = node.callFrame;
    const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').slice(-2).join('/').split('?')[0]}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + profile.timeDeltas[i]);
  });

  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  console.log(`\nself time, ${Math.round(total / 1000)} ms sampled over ${n} frames:`);
  for (const [key, time] of rows)
    console.log(`${(time / 1000 / n).toFixed(3).padStart(8)} ms/frame ${(time / total * 100).toFixed(1).padStart(5)}%  ${key}`);

  if (args.json) writeFileSync(args.json, JSON.stringify(profile));
}

if (errors.length) console.log('page errors:\n' + errors.join('\n'));
await browser.close();
