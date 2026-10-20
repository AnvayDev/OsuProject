import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackVirtual } from '@fw/audio/track/TrackVirtual';
import { DecouplingFramedClock } from '@fw/timing/DecouplingFramedClock';
import { FramedClock, ManualClock } from '@fw/timing/FramedClock';
import { InterpolatingFramedClock } from '@fw/timing/InterpolatingFramedClock';
import { FramedOffsetClock } from '@fw/timing/OffsetClock';

beforeEach(() => vi.useFakeTimers({ toFake: ['performance'] }));
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => vi.advanceTimersByTime(ms);

describe('DecouplingFramedClock', () => {
  it('runs in negative time while the source cannot, then hands over to the source at zero', () => {
    const track = new TrackVirtual(10000);
    const clock = new DecouplingFramedClock(track);

    expect(clock.seek(-100)).toBe(true);
    expect(track.isRunning).toBe(false);
    clock.start();
    clock.processFrame();
    expect(clock.currentTime).toBe(-100);
    expect(clock.isRunning).toBe(true);

    advance(50);
    clock.processFrame();
    expect(clock.currentTime).toBeCloseTo(-50);
    expect(track.isRunning).toBe(false);

    advance(60);
    clock.processFrame();
    expect(clock.currentTime).toBeCloseTo(10);
    expect(track.isRunning).toBe(true);

    advance(20);
    clock.processFrame();
    // now follows the source
    expect(clock.currentTime).toBe(track.currentTime);
  });

  it('keeps counting past the end of the source', () => {
    const track = new TrackVirtual(100);
    const clock = new DecouplingFramedClock(track);
    expect(clock.seek(200)).toBe(true);
    clock.start();
    clock.processFrame();
    advance(30);
    clock.processFrame();
    expect(clock.currentTime).toBeCloseTo(230);
    expect(track.isRunning).toBe(false);
  });

  it('passes through the source when decoupling is disabled', () => {
    const track = new TrackVirtual(100);
    const clock = new DecouplingFramedClock(track);
    clock.allowDecoupling = false;
    expect(clock.seek(-50)).toBe(false);
  });
});

describe('InterpolatingFramedClock', () => {
  it('smooths a coarsely-updating source and never goes backwards', () => {
    const manual = new ManualClock();
    manual.rate = 1;
    manual.isRunning = true;
    const source = new FramedClock(manual);
    const clock = new InterpolatingFramedClock(source);

    let last = -Infinity;
    const times: number[] = [];

    for (let frame = 0; frame < 60; frame++) {
      advance(16);
      // the source only reports time every ~48 ms
      if (frame % 3 === 0) manual.currentTime = (frame + 1) * 16;
      clock.processFrame();
      expect(clock.currentTime).toBeGreaterThanOrEqual(last);
      last = clock.currentTime;
      times.push(clock.currentTime);
    }

    expect(clock.isInterpolating).toBe(true);
    // within the allowable error (two frames at 60 fps) of the true time
    expect(Math.abs(clock.currentTime - 60 * 16)).toBeLessThanOrEqual(1000 / 60 * 2);
    // and advancing every frame rather than in 48 ms steps
    const steps = times.slice(10).map((t, i, a) => i === 0 ? 1 : t - a[i - 1]);
    expect(steps.every(s => s > 0)).toBe(true);
  });

  it('jumps to the source time on a seek', () => {
    const manual = new ManualClock();
    manual.rate = 1;
    manual.isRunning = true;
    const clock = new InterpolatingFramedClock(new FramedClock(manual));
    for (let i = 0; i < 5; i++) { advance(16); manual.currentTime += 16; clock.processFrame(); }
    manual.currentTime = 5000;
    advance(16);
    clock.processFrame();
    expect(clock.currentTime).toBe(5000);
    expect(clock.isInterpolating).toBe(false);
  });
});

describe('FramedOffsetClock', () => {
  it('applies the offset without registering it as elapsed time', () => {
    const manual = new ManualClock();
    const clock = new FramedOffsetClock(manual);
    manual.currentTime = 100;
    clock.processFrame();
    clock.offset = 50;
    expect(clock.currentTime).toBe(150);
    manual.currentTime = 110;
    clock.processFrame();
    expect(clock.currentTime).toBe(160);
    expect(clock.elapsedFrameTime).toBe(10);
  });
});
