// Web tooling, not part of osu!: a frame statistics readout for measuring on the machine the game runs on (?stats=1).
// It reports what this page can know: the interval between frames, our own update and draw time (GameHost), and the renderer's draw calls
// and quads. Time spent by the GPU and the compositor is not visible to a page; a frame interval above the display's refresh interval is
// how it shows. Click the readout to copy the numbers as JSON.

import type { Drawable } from '@fw/graphics/Drawable';
import type { GLContainer } from '@fw/graphics/containers/GLContainer';
import type { GameHost } from '@fw/platform/GameHost';

/** Frames per sample window. */
const window_size = 240;

export function installStatsOverlay(host: GameHost): void {
  const element = document.createElement('pre');
  element.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:1000;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,Menlo,monospace;'
    + 'color:#fff;background:rgba(0,0,0,0.75);border-radius:4px;cursor:pointer;white-space:pre';
  document.body.appendChild(element);

  const intervals: number[] = [];
  const updates: number[] = [];
  const draws: number[] = [];

  let last = 0;
  let lastFrameStart = 0;
  let lastText = 0;
  let longFrames = 0;
  let report: Record<string, unknown> = {};

  const findSurface = (d: Drawable): GLContainer | null => {
    if ((d as unknown as { renderer?: unknown }).renderer !== undefined)
      return d as unknown as GLContainer;

    for (const child of (d as unknown as { internalChildren?: readonly Drawable[] }).internalChildren ?? []) {
      const found = findSurface(child);
      if (found !== null) return found;
    }

    return null;
  };

  const summarise = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const round = (v: number) => Math.round(v * 10) / 10;

    return {
      mean: round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)),
      p95: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0),
      max: round(sorted[sorted.length - 1] ?? 0),
    };
  };

  const tick = (time: number): void => {
    // (only frames the game ran)
    if (host.lastFrameStart !== lastFrameStart) {
      lastFrameStart = host.lastFrameStart;

      if (last !== 0) {
        const interval = time - last;
        intervals.push(interval);
        if (interval > 25) longFrames++;
      }

      last = time;
      updates.push(host.lastUpdateDuration);
      draws.push(host.lastDrawDuration);

      for (const list of [intervals, updates, draws]) {
        if (list.length > window_size) list.shift();
      }
    }

    if (time - lastText > 500 && intervals.length > 0) {
      lastText = time;

      const root = (host as unknown as { root: Drawable | null }).root;
      const statistics = root !== null ? findSurface(root)?.renderer?.statistics : undefined;

      const interval = summarise(intervals);
      const update = summarise(updates);
      const draw = summarise(draws);

      report = {
        fps: Math.round(1000 / interval.mean), frameIntervalMs: interval, updateMs: update, drawMs: draw, framesOver25Ms: longFrames,
        drawCalls: statistics?.drawCalls, quads: statistics?.quads,
        canvas: `${document.querySelector('canvas')?.width}x${document.querySelector('canvas')?.height}`, devicePixelRatio: window.devicePixelRatio,
        renderer: statistics !== undefined ? 'webgl' : 'dom',
      };

      element.textContent = `${report.fps} fps   frame ${interval.mean} ms (p95 ${interval.p95}, max ${interval.max})\n`
        + `update ${update.mean} ms (p95 ${update.p95})   draw ${draw.mean} ms (p95 ${draw.p95})\n`
        + `${statistics !== undefined ? `${statistics.drawCalls} draw calls, ${statistics.quads} quads` : 'DOM renderer'}   frames over 25 ms: ${longFrames}\n`
        + 'click to copy';
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);

  element.addEventListener('click', () => {
    void navigator.clipboard.writeText(JSON.stringify(report));
    longFrames = 0;
  });
}
