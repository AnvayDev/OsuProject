import { describe, expect, it } from 'vitest';
import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { Game } from '@fw/Game';
import { LoadState } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { TestClock } from './testHost';

// Web: background loads (loadComponentsAsync) run on the main thread in slices, yielding to rendering in between.

/** Which task each load ran in: incremented by a timer task, so loads in one task share a value. */
let task = 0;
const loadedIn: number[] = [];

class SlowLoad extends Container {
  constructor(readonly id: number) {
    super();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const until = performance.now() + 3;
    while (performance.now() < until) { /* a load taking 3ms */ }

    loadedIn.push(task);
    return r;
  }
}

function setup() {
  task = 0;
  loadedIn.length = 0;

  const clock = new TestClock();
  const root = new Container().with({ size: new Vector2(800, 600) });
  const deps = new DependencyContainer();
  deps.cacheAs(Game, Object.create(Game.prototype) as Game);
  root.clock = clock;
  root.loadDrawable(clock, deps);

  let ticking = true;
  const tick = () => {
    task++;
    if (ticking) setTimeout(tick);
  };
  setTimeout(tick);

  const settle = async () => {
    for (let i = 0; i < 100 && loadedIn.length < 8; i++)
      await new Promise(r => setTimeout(r, 5));

    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r));
      clock.currentTime += 16;
      root.updateSubTree();
    }

    ticking = false;
  };

  return { root, settle };
}

const slowLoads = () => Array.from({ length: 8 }, (_, i) => new SlowLoad(i));

describe('background loads (loadComponentsAsync)', () => {
  it('spread many components over several tasks, reporting them all once, in order', async () => {
    const { root, settle } = setup();
    const reported: number[][] = [];

    void root.loadComponentsAsync(slowLoads(), loaded => reported.push(loaded.map(l => l.id)));
    await settle();

    expect(reported).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]]);
    expect(new Set(loadedIn).size).toBeGreaterThan(1);
  });

  it('spread the children of one large component over several tasks, and finish it once they have all loaded', async () => {
    const { root, settle } = setup();
    const children = slowLoads();
    const container = new Container().with({ children });
    let loaded = false;

    void root.loadComponentAsync(container, () => { loaded = true; });
    await settle();

    expect(loaded).toBe(true);
    expect(container.loadState).toBeGreaterThanOrEqual(LoadState.Ready);
    expect(children.every(c => c.loadState >= LoadState.Ready && c.parent === container)).toBe(true);
    expect(new Set(loadedIn).size).toBeGreaterThan(1);
  });

  it('never split a synchronous load', () => {
    const { root } = setup();
    const children = slowLoads();

    root.add(new Container().with({ children }));

    expect(children.every(c => c.loadState >= LoadState.Ready)).toBe(true);
    expect(new Set(loadedIn).size).toBe(1);
  });
});
