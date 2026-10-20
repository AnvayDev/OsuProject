import { describe, expect, it } from 'vitest';
import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { Game } from '@fw/Game';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScreenExitEvent, ScreenTransitionEvent } from '@fw/screens/IScreen';
import { Screen } from '@fw/screens/Screen';
import { ScreenStack } from '@fw/screens/ScreenStack';
import { TestClock } from './testHost';

const log: string[] = [];

class TestScreen extends Screen {
  blockExit = false;

  constructor(readonly label: string) {
    super();
  }

  override onEntering(e: ScreenTransitionEvent) { log.push(`${this.label}:entering(from ${(e.last as TestScreen | null)?.label ?? '-'})`); }
  override onExiting(e: ScreenExitEvent) { log.push(`${this.label}:exiting(to ${(e.destination as TestScreen | null)?.label ?? '-'})`); return this.blockExit; }
  override onResuming(e: ScreenTransitionEvent) { log.push(`${this.label}:resuming(from ${(e.last as TestScreen).label})`); }
  override onSuspending(e: ScreenTransitionEvent) { log.push(`${this.label}:suspending(to ${(e.next as TestScreen).label})`); }
}

function setup() {
  log.length = 0;
  const clock = new TestClock();
  const root = new Container().with({ size: new Vector2(800, 600) });
  const deps = new DependencyContainer();
  deps.cacheAs(Game, Object.create(Game.prototype) as Game);
  root.clock = clock;
  root.loadDrawable(clock, deps);

  const frame = (ms = 16) => {
    clock.elapsedFrameTime = ms;
    clock.currentTime += ms;
    root.updateSubTree();
  };
  // loadComponentAsync loads in a microtask and reports back on the scheduler.
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r));
      frame();
    }
  };

  return { root, frame, settle };
}

describe('ScreenStack', () => {
  it('enters the base screen once loaded and suspends/resumes around a child', async () => {
    const { root, settle } = setup();
    const a = new TestScreen('A');
    const stack = new ScreenStack(a);
    root.add(stack);
    await settle();
    expect(log).toEqual(['A:entering(from -)']);
    expect(stack.currentScreen).toBe(a);
    expect(a.isCurrentScreen()).toBe(true);

    const b = new TestScreen('B');
    a.push(b);
    expect(log.at(-1)).toBe('A:suspending(to B)');
    expect(a.isCurrentScreen()).toBe(false);
    await settle();
    expect(log.at(-1)).toBe('B:entering(from A)');
    expect(b.getParentScreen()).toBe(a);
    expect(a.getChildScreen()).toBe(b);

    b.exit();
    expect(log.slice(-2)).toEqual(['B:exiting(to A)', 'A:resuming(from B)']);
    expect(stack.currentScreen).toBe(a);
    expect(a.lifetimeEnd).toBe(Number.MAX_VALUE);
  });

  it('removes and disposes exited screens once they are no longer alive', async () => {
    const { root, settle } = setup();
    const a = new TestScreen('A');
    const b = new TestScreen('B');
    const stack = new ScreenStack(a);
    root.add(stack);
    await settle();
    a.push(b);
    await settle();
    expect(b.parent).toBe(stack);

    b.exit();
    await settle();
    expect(b.parent).toBeNull();
    expect(b.isDisposed).toBe(true);
    expect(a.isAlive).toBe(true);
  });

  it('a blocked exit keeps the screen current', async () => {
    const { root, settle } = setup();
    const a = new TestScreen('A');
    const b = new TestScreen('B');
    root.add(new ScreenStack(a));
    await settle();
    a.push(b);
    await settle();

    b.blockExit = true;
    b.exit();
    expect(log.at(-1)).toBe('B:exiting(to A)');
    expect(b.isCurrentScreen()).toBe(true);
  });

  it('makeCurrent exits every child with the final destination and resumes once', async () => {
    const { root, settle } = setup();
    const [a, b, c] = ['A', 'B', 'C'].map(l => new TestScreen(l));
    root.add(new ScreenStack(a));
    await settle();
    a.push(b);
    await settle();
    b.push(c);
    await settle();

    log.length = 0;
    a.makeCurrent();
    expect(log).toEqual(['C:exiting(to A)', 'B:exiting(to A)', 'A:resuming(from B)']);
    expect(a.isCurrentScreen()).toBe(true);
  });

  it('child screens load with the parent screen\'s dependencies', async () => {
    const { root, settle } = setup();

    class Token { constructor(readonly value: string) {} }

    class Provider extends TestScreen {
      protected override createChildDependencies(parent: IReadOnlyDependencyContainer) {
        const deps = new DependencyContainer(parent);
        deps.cacheAs(Token, new Token('from A'));
        return deps;
      }
    }

    let resolved: string | null = null;
    class Consumer extends TestScreen {
      protected override load(dependencies: IReadOnlyDependencyContainer) {
        const r = super.load(dependencies);
        resolved = dependencies.get(Token)?.value ?? null;
        return r;
      }
    }

    const a = new Provider('A');
    root.add(new ScreenStack(a));
    await settle();
    a.push(new Consumer('B'));
    await settle();
    expect(resolved).toBe('from A');
  });
});
