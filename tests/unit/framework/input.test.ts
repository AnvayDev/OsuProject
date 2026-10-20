import { describe, expect, it } from 'vitest';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { InputHandler, UserInputManager } from '@fw/input/InputManager';
import type { ClickEvent, DoubleClickEvent, DragEvent, DragStartEvent, HoverEvent, KeyDownEvent, MouseDownEvent, ScrollEvent } from '@fw/input/events/UIEvents';
import { Key, MouseButton } from '@fw/input/Key';
import { KeyboardKeyInput, MouseButtonInput, MousePositionAbsoluteInput, MouseScrollRelativeInput, type IInput } from '@fw/input/StateChanges';
import { Vector2 } from '@fw/layout/Vector2';
import { TestClock } from './testHost';

class ScriptedHandler extends InputHandler {
  push(i: IInput) {
    this.enqueueInput(i);
  }
}

class TestBox extends Box {
  log: string[] = [];
  handleHover = false;
  handleClick = true;
  handleDrag = false;
  focusable = false;

  protected override onHover(_e: HoverEvent) { this.log.push('hover'); return this.handleHover; }
  protected override onHoverLost() { this.log.push('hoverlost'); }
  protected override onMouseDown(e: MouseDownEvent) { this.log.push(`down:${MouseButton[e.button]}`); return false; }
  protected override onMouseUp() { this.log.push('up'); }
  protected override onClick(_e: ClickEvent) { this.log.push('click'); return this.handleClick; }
  protected override onDoubleClick(_e: DoubleClickEvent) { this.log.push('dblclick'); return true; }
  protected override onDragStart(_e: DragStartEvent) { this.log.push('dragstart'); return this.handleDrag; }
  protected override onDrag(e: DragEvent) { this.log.push(`drag:${e.delta.x}`); }
  protected override onDragEnd() { this.log.push('dragend'); }
  protected override onScroll(e: ScrollEvent) { this.log.push(`scroll:${e.scrollDelta.y}`); return true; }
  protected override onKeyDown(e: KeyDownEvent) { this.log.push(`key:${Key[e.key]}${e.repeat ? ':repeat' : ''}`); return true; }
  override get acceptsFocus() { return this.focusable; }
  protected override onFocus() { this.log.push('focus'); }
  protected override onFocusLost() { this.log.push('focuslost'); }
}

function setup() {
  const clock = new TestClock();
  const handler = new ScriptedHandler();
  const root = new UserInputManager(() => [handler], () => true).with({ size: new Vector2(1000, 800) });
  root.clock = clock;
  root.loadDrawable(clock, new DependencyContainer());

  const frame = (ms = 16) => {
    clock.elapsedFrameTime = ms;
    clock.currentTime += ms;
    root.updateSubTree();
    root.updateSubTreeMasking();
  };

  const back = new TestBox().with({ size: new Vector2(500, 500) });
  const front = new TestBox().with({ position: new Vector2(100, 100), size: new Vector2(100, 100) });
  root.add(back);
  root.add(front);
  frame();

  const move = (x: number, y: number) => handler.push(new MousePositionAbsoluteInput(new Vector2(x, y)));
  const press = (b = MouseButton.Left) => handler.push(new MouseButtonInput(b, true));
  const release = (b = MouseButton.Left) => handler.push(new MouseButtonInput(b, false));

  return { root, handler, frame, back, front, move, press, release, clock };
}

describe('InputManager', () => {
  it('hover propagates front-to-back until handled, and hover lost fires on leave', () => {
    const { frame, back, front, move } = setup();
    move(150, 150);
    frame();
    expect(front.log).toEqual(['hover']);
    expect(back.log).toEqual(['hover']);

    front.handleHover = true;
    front.log = []; back.log = [];
    move(300, 300);
    frame();
    expect(front.log).toEqual(['hoverlost']);
    expect(back.log).toEqual([]); // still hovered
  });

  it('click goes to the front-most handler; mouse up reaches drawables up to the mouse-down handler', () => {
    const { frame, back, front, move, press, release } = setup();
    move(150, 150);
    press();
    release();
    frame();
    expect(front.log).toContain('click');
    expect(back.log).not.toContain('click'); // front handled it
  });

  it('no click if released outside', () => {
    const { frame, front, move, press, release } = setup();
    move(150, 150);
    press();
    frame();
    move(600, 600);
    release();
    frame();
    expect(front.log).not.toContain('click');
  });

  it('drag starts after moving more than 10 units and blocks the click', () => {
    const { frame, front, move, press, release } = setup();
    front.handleDrag = true;
    move(150, 150);
    press();
    frame();
    move(155, 150);
    frame();
    expect(front.log).not.toContain('dragstart');
    move(161, 150);
    frame();
    expect(front.log).toContain('dragstart');
    expect(front.log).toContain('drag:6');
    release();
    frame();
    expect(front.log).toContain('dragend');
    expect(front.log).not.toContain('click');
  });

  it('double click within 250ms (and blocks the second click)', () => {
    const { frame, front, move, press, release } = setup();
    move(150, 150);
    press(); release(); frame(100);
    press(); release(); frame(100);
    expect(front.log.filter(l => l === 'dblclick')).toHaveLength(1);
    expect(front.log.filter(l => l === 'click')).toHaveLength(1);

    front.log = [];
    frame(300);
    press(); release(); frame();
    press(); release(); frame();
    expect(front.log.filter(l => l === 'click')).toHaveLength(1);
  });

  it('scroll goes to the hovered handler', () => {
    const { frame, front, handler, move } = setup();
    move(150, 150);
    handler.push(new MouseScrollRelativeInput(new Vector2(0, 1)));
    frame();
    expect(front.log).toContain('scroll:1');
  });

  it('key repeat: 250 ms initial delay, then every 70 ms', () => {
    const { frame, front, handler, root } = setup();
    front.focusable = true;
    root.changeFocus(front);
    handler.push(new KeyboardKeyInput(Key.A, true));
    frame(16);
    expect(front.log.filter(l => l.startsWith('key:A'))).toEqual(['key:A']);
    for (let t = 0; t < 240; t += 10) frame(10); // 256 ms elapsed after press
    expect(front.log.filter(l => l === 'key:A:repeat')).toHaveLength(1);
    for (let t = 0; t < 70; t += 10) frame(10);
    expect(front.log.filter(l => l === 'key:A:repeat')).toHaveLength(2);
  });

  it('clicking changes focus to the clicked focusable drawable', () => {
    const { frame, front, back, move, press, release } = setup();
    front.focusable = true;
    move(150, 150);
    press(); release(); frame();
    expect(front.hasFocus).toBe(true);
    expect(front.log).toContain('focus');

    front.handleClick = false;
    back.handleClick = false;
    move(400, 400);
    press(); release(); frame();
    expect(front.hasFocus).toBe(false);
    expect(front.log).toContain('focuslost');
  });

  it('drawables without input handlers do not request input', () => {
    const { root, frame } = setup();
    const plain = new Box().with({ size: new Vector2(1000) });
    root.add(plain);
    frame();
    expect(plain.requestsPositionalInput).toBe(false);
    expect(root.positionalInputQueue).not.toContain(plain);
  });
});
