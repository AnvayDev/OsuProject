import { describe, expect, it } from 'vitest';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { BasicScrollContainer } from '@fw/graphics/containers/BasicScrollContainer';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { InputHandler, UserInputManager } from '@fw/input/InputManager';
import { Key, MouseButton } from '@fw/input/Key';
import { PlatformActionContainer } from '@fw/input/PlatformActionContainer';
import { KeyboardKeyInput, MouseButtonInput, MousePositionAbsoluteInput, MouseScrollRelativeInput, type IInput } from '@fw/input/StateChanges';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { GameHost } from '@fw/platform/GameHost';
import { TestClock } from './testHost';
import type { Drawable } from '@fw/graphics/Drawable';

class ScriptedHandler extends InputHandler {
  push(i: IInput) {
    this.enqueueInput(i);
  }
}

class TestScrollContainer extends BasicScrollContainer {
  get bar() {
    return this.scrollbar;
  }
}

function setup(content: Drawable = new Box().with({ size: new Vector2(100, 2000) })) {
  const clock = new TestClock();
  const handler = new ScriptedHandler();
  const scroll = new TestScrollContainer().with({ size: new Vector2(500, 500), child: content });
  const root = new UserInputManager(() => [handler], () => true).with({
    size: new Vector2(1000, 800),
    child: new PlatformActionContainer().with({ child: scroll }),
  });
  const deps = new DependencyContainer();
  deps.cacheAs(GameHost, new GameHost());
  root.clock = clock;
  root.loadDrawable(clock, deps);

  const frame = (ms = 16) => {
    clock.elapsedFrameTime = ms;
    clock.currentTime += ms;
    root.updateSubTree();
    root.updateSubTreeMasking();
  };
  const frames = (ms: number) => { for (let t = 0; t < ms; t += 16) frame(); };

  const move = (x: number, y: number) => handler.push(new MousePositionAbsoluteInput(new Vector2(x, y)));
  const press = () => handler.push(new MouseButtonInput(MouseButton.Left, true));
  const release = () => handler.push(new MouseButtonInput(MouseButton.Left, false));
  const key = (k: Key) => { handler.push(new KeyboardKeyInput(k, true)); frame(); handler.push(new KeyboardKeyInput(k, false)); frame(); };
  const wheel = (dy: number, precise = false) => handler.push(new MouseScrollRelativeInput(new Vector2(0, dy), precise));

  move(100, 100);
  frame();
  return { scroll, frame, frames, move, press, release, key, wheel };
}

describe('ScrollContainer', () => {
  it('wheel scroll moves the target by ScrollDistance and approaches it exponentially', () => {
    const { scroll, frame, frames, wheel } = setup();
    wheel(-1);
    frame();
    expect(scroll.target).toBe(80);
    expect(scroll.current).toBeCloseTo(80 * (1 - Math.exp(-0.01 * 16)), 10);

    // e^(-0.01 t) must fall below DOUBLE_EPSILON / 80 before current snaps to target.
    frames(2000);
    expect(scroll.current).not.toBe(80);
    frames(1000);
    expect(scroll.current).toBe(80);
    expect(scroll.scrollContent.y).toBe(-80);
  });

  it('precise scroll uses a 0.05 decay', () => {
    const { scroll, frame, wheel } = setup();
    wheel(-0.5, true);
    frame();
    expect(scroll.target).toBe(40);
    expect(scroll.current).toBeCloseTo(40 * (1 - Math.exp(-0.05 * 16)), 10);
  });

  it('sizes, fades and positions the scrollbar', () => {
    const { scroll, frames } = setup();
    frames(400);
    expect(scroll.bar.alpha).toBe(1);
    expect(scroll.bar.drawHeight).toBeCloseTo(125);

    scroll.scrollTo(300, false);
    frames(16);
    // (500 - 125) * 300 / 1500
    expect(scroll.bar.y).toBeCloseTo(75);
  });

  it('dragging moves content 1:1, halves overscroll and springs back', () => {
    const { scroll, frame, frames, move, press, release } = setup();
    move(100, 300);
    press();
    move(100, 200);
    frame();
    expect(scroll.target).toBe(100);
    expect(scroll.current).toBe(100);

    move(100, 500);
    frame();
    // 300 px down from 100: 100 within bounds, the remaining 200 halved.
    expect(scroll.target).toBe(-100);

    release();
    frames(3000);
    expect(scroll.current).toBeCloseTo(0, 5);
    expect(scroll.target).toBeCloseTo(0, 5);
  });

  it('flicks with the decayed drag velocity on release', () => {
    const { scroll, frame, move, press, release } = setup();
    move(100, 400);
    press();
    for (let y = 380; y >= 300; y -= 20) {
      move(100, y);
      frame();
    }
    const before = scroll.target;
    release();
    frame();
    // ~20 px / 16 ms → distance = v / (1 - e^-0.0035) ≈ 357
    expect(scroll.target - before).toBeGreaterThan(300);
    expect(scroll.target - before).toBeLessThan(400);
  });

  it('Home/End (PlatformAction) and PageDown scroll while hovered', () => {
    const { scroll, key } = setup();
    key(Key.End);
    expect(scroll.target).toBe(1500);
    key(Key.Home);
    expect(scroll.target).toBe(0);
    key(Key.PageDown);
    expect(scroll.target).toBe(500);
  });

  it('scrollIntoView scrolls the minimum distance', () => {
    const boxes = Array.from({ length: 20 }, () => new Box().with({ size: new Vector2(100, 100) }));
    const flow = new FillFlowContainer().with({ direction: FillDirection.Vertical, relativeSizeAxes: Axes.X, autoSizeAxes: Axes.Y, children: boxes });
    const { scroll, frame, frames } = setup(flow);
    frame();
    scroll.scrollIntoView(boxes[12]);
    expect(scroll.target).toBe(800);
    // Compares against current (not target), so let it arrive first.
    scroll.scrollIntoView(boxes[3]);
    expect(scroll.target).toBe(800);
    frames(3000);
    scroll.scrollIntoView(boxes[3]);
    expect(scroll.target).toBe(300);
  });
});
