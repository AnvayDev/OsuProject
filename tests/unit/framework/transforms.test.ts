import { describe, expect, it } from 'vitest';
import { Easing, applyEasing } from '@fw/transforms/Easing';
import { Transformable } from '@fw/transforms/Transformable';
import type { IFrameBasedClock } from '@fw/timing/IClock';

class ManualClock implements IFrameBasedClock {
  currentTime = 0;
  rate = 1;
  isRunning = true;
  elapsedFrameTime = 0;
  framesPerSecond = 0;
  processFrame() {}
}

/** Minimal stand-in for a Drawable: one transformable member, updated like Drawable.UpdateSubTree does. */
class TestObject extends Transformable {
  alpha = 0;
  x = 0;
  y = 0;

  constructor(private readonly _clock: ManualClock | null) {
    super();
  }

  get clock() {
    return this._clock;
  }

  update() {
    this.updateTransforms();
  }

  fadeTo(a: number, duration = 0, easing = Easing.None) {
    return this.transformTo('alpha', a, duration, easing);
  }
}

function setup() {
  const clock = new ManualClock();
  const obj = new TestObject(clock);
  const step = (ms: number) => {
    clock.currentTime += ms;
    obj.update();
  };
  return { clock, obj, step };
}

describe('Easing (DefaultEasingFunction)', () => {
  it('starts at 0 and ends at 1 for every easing', () => {
    for (const e of Object.values(Easing).filter((v): v is Easing => typeof v === 'number')) {
      expect(applyEasing(e, 0)).toBeCloseTo(0, 10);
      expect(applyEasing(e, 1)).toBeCloseTo(1, 10);
    }
  });

  it('matches osu!framework formulas at sample points', () => {
    expect(applyEasing(Easing.OutQuint, 0.5)).toBeCloseTo(1 - Math.pow(0.5, 5), 12);
    expect(applyEasing(Easing.OutQuad, 0.25)).toBeCloseTo(0.4375, 12);
    expect(applyEasing(Easing.OutExpo, 0.5)).toBeCloseTo(-Math.pow(2, -5) + 1 + Math.pow(2, -10) * 0.5, 12);
    // OutBack overshoots past 1.
    expect(applyEasing(Easing.OutBack, 0.7)).toBeGreaterThan(1);
    // OutElastic overshoots, OutBounce does not.
    expect(applyEasing(Easing.OutElastic, 0.15)).toBeGreaterThan(1);
    for (let t = 0; t <= 1; t += 0.01) expect(applyEasing(Easing.OutBounce, t)).toBeLessThanOrEqual(1 + 1e-12);
  });
});

describe('Transformable', () => {
  it('interpolates over time and lands exactly on the end value', () => {
    const { obj, step } = setup();
    obj.fadeTo(1, 100);
    step(50);
    expect(obj.alpha).toBeCloseTo(0.5, 10);
    step(50);
    expect(obj.alpha).toBe(1);
    expect(obj.transforms.length).toBe(0); // completed transforms are removed
  });

  it('applies the easing function', () => {
    const { obj, step } = setup();
    obj.fadeTo(1, 100, Easing.OutQuint);
    step(50);
    expect(obj.alpha).toBeCloseTo(applyEasing(Easing.OutQuint, 0.5), 10);
  });

  it('applies zero-duration transforms immediately', () => {
    const { obj } = setup();
    obj.fadeTo(0.3);
    expect(obj.alpha).toBe(0.3);
  });

  it('applies end value immediately when there is no clock', () => {
    const obj = new TestObject(null);
    obj.fadeTo(0.7, 500);
    expect(obj.alpha).toBe(0.7);
  });

  it('a new transform interrupts the old one and starts from the current value', () => {
    const { obj, step } = setup();
    obj.fadeTo(1, 100);
    step(50);
    obj.fadeTo(0, 100);
    // Frame-sized steps: the old transform is rewound to the new one's start time before its start value is read.
    // (With a step that crosses the old transform's end, osu!framework applies it to end first — same here.)
    step(25);
    step(25);
    // started from 0.5 (value at interruption), halfway to 0
    expect(obj.alpha).toBeCloseTo(0.25, 10);
    expect(obj.transforms.length).toBe(1); // the previous one is dropped once the new one is applied
  });

  it('adding a transform removes later-starting transforms of the same member', () => {
    const { obj, step } = setup();
    obj.delay(200).transformTo('alpha', 1, 100);
    obj.fadeTo(0.5, 100);
    step(400);
    expect(obj.alpha).toBe(0.5);
  });

  it('transforms on different members do not interfere', () => {
    const { obj, step } = setup();
    obj.transformTo('x', 100, 100, Easing.None, 'position');
    obj.transformTo('y', 50, 100, Easing.None, 'position');
    step(50);
    expect(obj.x).toBeCloseTo(50);
    expect(obj.y).toBeCloseTo(25);
  });

  it('beginDelayedSequence offsets start times and restores the delay', () => {
    const { obj, step } = setup();
    {
      using _ = obj.beginDelayedSequence(100);
      obj.fadeTo(1, 100);
    }
    expect(obj.transformDelay).toBe(0);
    step(100);
    expect(obj.alpha).toBe(0);
    step(50);
    expect(obj.alpha).toBeCloseTo(0.5);
  });

  it('finishTransforms applies end values', () => {
    const { obj } = setup();
    obj.fadeTo(1, 500);
    obj.finishTransforms();
    expect(obj.alpha).toBe(1);
  });

  it('clearTransforms stops at the current value', () => {
    const { obj, step } = setup();
    obj.fadeTo(1, 100);
    step(50);
    obj.clearTransforms();
    step(50);
    expect(obj.alpha).toBeCloseTo(0.5);
  });

  it('latestTransformEndTime is the last end time + 1', () => {
    const { obj } = setup();
    obj.fadeTo(1, 300);
    expect(obj.latestTransformEndTime).toBe(301);
  });
});

describe('TransformSequence', () => {
  it('then() continues after the longest transform, with optional delay', () => {
    const { obj, step } = setup();
    obj.fadeTo(1, 100).then(50).transformTo('alpha', 0, 100);
    step(100);
    expect(obj.alpha).toBe(1);
    step(50);
    expect(obj.alpha).toBe(1);
    step(50);
    expect(obj.alpha).toBeCloseTo(0.5);
    step(50);
    expect(obj.alpha).toBe(0);
  });

  it('delay() on a sequence offsets later appends only', () => {
    const { obj, step } = setup();
    obj.transformTo('x', 10, 100).delay(50).transformTo('alpha', 1, 100);
    step(100);
    expect(obj.x).toBe(10);
    expect(obj.alpha).toBeCloseTo(0.5);
  });

  it('loop(pause) repeats forever', () => {
    const { obj, step } = setup();
    obj.fadeTo(0).then().transformTo('alpha', 1, 100).loop(100);
    step(50);
    expect(obj.alpha).toBeCloseTo(0.5);
    step(100); // 150: in pause, value at end
    expect(obj.alpha).toBe(1);
    step(100); // 250: second iteration started at 200
    expect(obj.alpha).toBeCloseTo(0.5);
    step(1000);
    expect(obj.transforms.length).toBeGreaterThan(0);
  });

  it('loop(pause, numIters) stops after numIters iterations', () => {
    const { obj, step } = setup();
    obj.loop(0, 3, o => o.fadeTo(0).then().transformTo('alpha', 1, 100));
    for (let i = 0; i < 3; i++) {
      step(50);
      expect(obj.alpha).toBeCloseTo(0.5);
      step(50);
    }
    step(50);
    expect(obj.alpha).toBe(1);
    expect(obj.transforms.length).toBe(0);
  });

  // Ported from osu.Framework.Tests/Transforms/TestSceneTransformEventBindings.cs
  it('TestOnCompleteBinding', () => {
    const { obj, step } = setup();
    let completedFired = 0;
    obj.fadeTo(1, 500).then().transformTo('alpha', 0, 500).onComplete(() => completedFired++);
    expect(completedFired).toBe(0);
    for (let i = 0; i < 20; i++) step(100);
    expect(completedFired).toBe(1);
  });

  it('TestOnCompleteBindingImmediateExecution', () => {
    const { obj, step } = setup();
    let completedFired = 0;
    obj.fadeTo(1, 500).then().transformTo('alpha', 0).onComplete(() => completedFired++);
    expect(completedFired).toBe(0);
    for (let i = 0; i < 20; i++) step(100);
    expect(completedFired).toBe(1);
  });

  it('TestOnCompleteBindingInterrupted', () => {
    const { obj, step } = setup();
    let completedFired = 0;
    let abortFired = 0;
    obj.fadeTo(1, 500).then().transformTo('alpha', 0, 500).onAbort(() => abortFired++);
    obj.fadeTo(1, 500).onComplete(() => completedFired++);
    expect(completedFired).toBe(0);
    expect(abortFired).toBe(1);
    for (let i = 0; i < 20; i++) step(100);
    expect(completedFired).toBe(1);
  });

  it('TestOnCompleteBindingFinishTransforms', () => {
    const { obj } = setup();
    let completedFired = 0;
    obj.fadeTo(1, 500).then().transformTo('alpha', 0, 500).onComplete(() => completedFired++);
    obj.finishTransforms();
    expect(completedFired).toBe(1);
  });

  it('finally() fires on abort', () => {
    const { obj, step } = setup();
    let fired = 0;
    obj.fadeTo(1, 500).finally(() => fired++);
    step(100);
    obj.fadeTo(0, 100);
    step(1);
    expect(fired).toBe(1);
  });
});
