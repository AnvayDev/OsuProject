import { describe, expect, it } from 'vitest';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { InputHandler, UserInputManager } from '@fw/input/InputManager';
import { Key } from '@fw/input/Key';
import { KeyboardKeyInput, type IInput } from '@fw/input/StateChanges';
import {
  InputKey, KeyBinding, KeyBindingContainer, KeyCombination, KeyCombinationMatchingMode, type IKeyBindingHandler, type KeyBindingPressEvent, type KeyBindingReleaseEvent,
} from '@fw/input/bindings/KeyBindings';
import { Vector2 } from '@fw/layout/Vector2';
import { TestClock } from './testHost';

enum TestAction { Back, Select, ToggleSettings, NextItem }

class TestBindings extends KeyBindingContainer<TestAction> {
  constructor(mode = KeyCombinationMatchingMode.Any) {
    super(TestAction, undefined, mode);
  }

  get defaultKeyBindings() {
    return [
      new KeyBinding(InputKey.Escape, TestAction.Back),
      new KeyBinding(InputKey.Enter, TestAction.Select),
      new KeyBinding([InputKey.Control, InputKey.O], TestAction.ToggleSettings),
      new KeyBinding(InputKey.O, TestAction.NextItem),
    ];
  }
}

class Handler extends Box implements IKeyBindingHandler<TestAction> {
  readonly keyBindingActionTypes = [TestAction];
  log: string[] = [];

  onPressed(e: KeyBindingPressEvent<TestAction>) {
    this.log.push(`+${TestAction[e.action]}`);
    return true;
  }

  onReleased(e: KeyBindingReleaseEvent<TestAction>) {
    this.log.push(`-${TestAction[e.action]}`);
  }
}

class Scripted extends InputHandler {
  push(i: IInput) { this.enqueueInput(i); }
}

function setup(mode?: KeyCombinationMatchingMode) {
  const clock = new TestClock();
  const input = new Scripted();
  const root = new UserInputManager(() => [input], () => true).with({ size: new Vector2(100) });
  root.clock = clock;
  root.loadDrawable(clock, new DependencyContainer());
  const handler = new Handler();
  root.add(new TestBindings(mode).with({ child: handler }));
  const frame = () => {
    clock.currentTime += 16;
    clock.elapsedFrameTime = 16;
    root.updateSubTree();
  };
  frame();
  const key = (k: Key, down: boolean) => {
    input.push(new KeyboardKeyInput(k, down));
    frame();
  };
  return { handler, key };
}

describe('KeyBindingContainer', () => {
  it('press and release', () => {
    const { handler, key } = setup();
    key(Key.Escape, true);
    key(Key.Escape, false);
    expect(handler.log).toEqual(['+Back', '-Back']);
  });

  it('modifier combination wins over the single key binding', () => {
    const { handler, key } = setup();
    key(Key.LControl, true);
    key(Key.O, true);
    expect(handler.log).toEqual(['+ToggleSettings']);
  });

  it('with Any matching, O alone still triggers while unrelated keys are held', () => {
    const { handler, key } = setup();
    key(Key.A, true);
    key(Key.O, true);
    expect(handler.log).toEqual(['+NextItem']);
  });

  it('virtual keys match either side (RControl)', () => {
    expect(new KeyCombination([InputKey.Control, InputKey.O]).isPressed(new KeyCombination([InputKey.RControl, InputKey.O]), null!, KeyCombinationMatchingMode.Exact)).toBe(true);
    expect(new KeyCombination([InputKey.O]).isPressed(new KeyCombination([InputKey.LShift, InputKey.O]), null!, KeyCombinationMatchingMode.Modifiers)).toBe(false);
  });
});
