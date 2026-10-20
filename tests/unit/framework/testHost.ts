import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import type { IFrameBasedClock } from '@fw/timing/IClock';
import { Vector2 } from '@fw/layout/Vector2';

export class TestClock implements IFrameBasedClock {
  currentTime = 0;
  rate = 1;
  isRunning = true;
  elapsedFrameTime = 0;
  framesPerSecond = 60;
  processFrame() {}
}

/** Minimal stand-in for GameHost: a root container of a fixed size, stepped manually. */
export function createHost(width = 1000, height = 800) {
  const clock = new TestClock();
  const root = new Container().with({ size: new Vector2(width, height) });
  root.clock = clock;
  root.loadDrawable(clock, new DependencyContainer());

  const frame = (ms = 0) => {
    clock.elapsedFrameTime = ms;
    clock.currentTime += ms;
    root.updateSubTree();
    root.updateSubTreeMasking();
    root.validateElementSubTree();
  };

  frame();
  return { clock, root, frame };
}
