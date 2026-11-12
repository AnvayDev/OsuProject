// Bench: how late input events reach page code on this machine (stage L1 of docs/GAMEPLAY-PLAN.md §2), how far each is from the next
// frame (L3a), how often pointer events arrive, and the browser's own event → presentation estimate (Event Timing API).

import { summarise, type Summary } from './stats';

export interface InputResult {
  keydown: { delay: Summary; toNextFrame: Summary } | null;
  pointerdown: { delay: Summary } | null;
  pointermove: { delay: Summary; perSecond: number; coalescedPerEvent: number } | null;
  pointerrawupdate: { delay: Summary; perSecond: number } | null;
  /** PerformanceEventTiming of key and pointer presses: processingStart - startTime, and duration (event to next presented frame, 8 ms steps). */
  eventTiming: { inputDelay: Summary; duration: Summary } | null;
}

/** Listens for `duration` ms. `status` receives a countdown and live counts. */
export function probeInput(duration: number, status: (text: string) => void): Promise<InputResult> {
  return new Promise(resolve => {
    const key: number[] = [];
    const keyToFrame: number[] = [];
    const down: number[] = [];
    const move: number[] = [];
    const raw: number[] = [];
    const timingDelay: number[] = [];
    const timingDuration: number[] = [];
    let coalesced = 0;

    const pendingKeys: number[] = [];
    const start = performance.now();

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      key.push(performance.now() - e.timeStamp);
      pendingKeys.push(e.timeStamp);
      e.preventDefault();
    };

    const onDown = (e: PointerEvent) => down.push(performance.now() - e.timeStamp);

    const onMove = (e: PointerEvent) => {
      move.push(performance.now() - e.timeStamp);
      coalesced += e.getCoalescedEvents?.().length ?? 1;
    };

    const onRaw = (e: Event) => raw.push(performance.now() - e.timeStamp);

    let observer: PerformanceObserver | null = null;

    try {
      observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries() as (PerformanceEntry & { processingStart: number })[]) {
          if (entry.name !== 'keydown' && entry.name !== 'pointerdown') continue;
          timingDelay.push(entry.processingStart - entry.startTime);
          timingDuration.push(entry.duration);
        }
      });
      observer.observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
    } catch {
      observer = null;
    }

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerrawupdate', onRaw, true);

    const frame = (t: number) => {
      // (the rAF timestamp is the start of the frame these presses can first appear in)
      for (const stamp of pendingKeys) keyToFrame.push(t - stamp);
      pendingKeys.length = 0;

      const elapsed = performance.now() - start;
      status(`${Math.max(0, Math.ceil((duration - elapsed) / 1000))} s left. Keys: ${key.length}, pointer moves: ${move.length}`);

      if (elapsed < duration) {
        requestAnimationFrame(frame);
        return;
      }

      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerrawupdate', onRaw, true);

      // Event Timing entries are delivered after the frame they belong to is presented: give the last ones a moment.
      setTimeout(() => {
        observer?.disconnect();

        const seconds = duration / 1000;

        resolve({
          keydown: key.length ? { delay: summarise(key), toNextFrame: summarise(keyToFrame) } : null,
          pointerdown: down.length ? { delay: summarise(down) } : null,
          pointermove: move.length ? { delay: summarise(move), perSecond: Math.round(move.length / seconds), coalescedPerEvent: Math.round(coalesced / move.length * 100) / 100 } : null,
          pointerrawupdate: raw.length ? { delay: summarise(raw), perSecond: Math.round(raw.length / seconds) } : null,
          eventTiming: timingDelay.length ? { inputDelay: summarise(timingDelay), duration: summarise(timingDuration) } : null,
        });
      }, 300);
    };

    requestAnimationFrame(frame);
  });
}
