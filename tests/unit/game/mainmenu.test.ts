// The main menu's state logic: MainMenuButton's ButtonSystemState → ButtonState mapping (osu.Game/Screens/Menu/MainMenuButton.cs UpdateState),
// TextFlowContainer's word splitting and InnerFlow layout (osu.Framework/Graphics/Containers/TextFlowContainer.cs, TextChunk.cs), and
// ReadableKeyCombinationProvider's key names (osu.Framework/Input/ReadableKeyCombinationProvider.cs).

import { describe, expect, it } from 'vitest';
import { Colour4 } from '@fw/graphics/Colour4';
import { Box } from '@fw/graphics/shapes/Box';
import { InnerFlow, NewLineContainer, TextChunk } from '@fw/graphics/containers/TextFlowContainer';
import { SpriteText } from '@fw/graphics/sprites/SpriteText';
import { InputKey, KeyCombination } from '@fw/input/bindings/KeyBindings';
import { ReadableKeyCombinationProvider } from '@fw/input/ReadableKeyCombinationProvider';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuIcon } from '@game/graphics/OsuIcon';
import { ButtonSystemState } from '@game/screens/menu/ButtonSystem';
import { ButtonState, MainMenuButton } from '@game/screens/menu/MainMenuButton';
import { createHost } from '../framework/testHost';

describe('MainMenuButton', () => {
  // (the button is not loaded: its state logic doesn't need it)
  const stateFor = (min: ButtonSystemState, max: ButtonSystemState, systemState: ButtonSystemState) => {
    const button = new MainMenuButton('test', '', OsuIcon.Settings, Colour4.White);
    button.visibleStateMin = min;
    button.visibleStateMax = max;
    button.buttonSystemState = systemState;
    return { state: button.state, contractStyle: button.contractStyle };
  };

  it('maps the menu state onto contracted / expanded / exploded like UpdateState', () => {
    const S = ButtonSystemState;

    // top-level buttons (TopLevel only)
    expect(stateFor(S.TopLevel, S.TopLevel, S.TopLevel).state).toBe(ButtonState.Expanded);
    expect(stateFor(S.TopLevel, S.TopLevel, S.Play).state).toBe(ButtonState.Exploded);
    expect(stateFor(S.TopLevel, S.TopLevel, S.Initial).state).toBe(ButtonState.Contracted);
    expect(stateFor(S.TopLevel, S.TopLevel, S.Exit).state).toBe(ButtonState.Contracted);

    // back button (Play..Edit)
    expect(stateFor(S.Play, S.Edit, S.TopLevel).state).toBe(ButtonState.Contracted);
    expect(stateFor(S.Play, S.Edit, S.Multi).state).toBe(ButtonState.Expanded);

    // play sub-menu buttons burst when the multi sub-menu opens
    expect(stateFor(S.Play, S.Play, S.Multi).state).toBe(ButtonState.Exploded);

    // entering a mode always contracts, with contract style 1
    expect(stateFor(S.TopLevel, S.TopLevel, S.EnteringMode)).toEqual({ state: ButtonState.Contracted, contractStyle: 1 });
  });
});

describe('TextFlowContainer', () => {
  class Chunk extends TextChunk<SpriteText> {
    split(text: string) {
      return this.splitWords(text);
    }
  }

  it('splits words after separators, dashes and slashes, keeping the separator on the preceding word', () => {
    const chunk = new Chunk('', true, () => new SpriteText());
    expect(chunk.split('Press Ctrl-O anywhere')).toEqual(['', 'Press ', 'Ctrl-', 'O ', 'anywhere']);
    expect(chunk.split('a/b')).toEqual(['', 'a/', 'b']);
  });

  const box = (w: number, h: number) => new Box().with({ size: new Vector2(w, h) });

  it('centres each row for a TopCentre text anchor and wraps rows at the flow width', () => {
    const { root, frame } = createHost();
    const flow = new InnerFlow().with({ width: 100, autoSizeAxes: Axes.Y, textAnchor: Anchor.TopCentre });

    root.add(flow);
    flow.addRange([box(30, 10), box(30, 10), box(60, 10)]);
    frame();

    // Row 1: 30 + 30 = 60 wide, offset (100 - 60) / 2; row 2: the 60-wide box, offset 20.
    expect(flow.children.map(c => c.position.x)).toEqual([20, 50, 20]);
    expect(flow.children.map(c => c.position.y)).toEqual([0, 0, 10]);
  });

  it('starts a new paragraph at a NewLineContainer, adding paragraphSpacing times the row height', () => {
    const { root, frame } = createHost();
    const flow = new InnerFlow().with({ width: 100, autoSizeAxes: Axes.Y });

    root.add(flow);
    flow.addRange([box(10, 20), new NewLineContainer(true), box(10, 20)]);
    frame();

    // The new line container itself is zero-sized and starts the new row at y = 20 + 0.5 * 20.
    expect(flow.children[2].position.y).toBeCloseTo(30, 5);
  });
});

describe('ReadableKeyCombinationProvider', () => {
  const provider = new ReadableKeyCombinationProvider();
  const readable = (...keys: InputKey[]) => provider.getReadableString(KeyCombination.of(...keys));

  it('orders modifiers Ctrl, Alt, Shift before other keys and joins with "-"', () => {
    expect(readable(InputKey.Shift, InputKey.Control, InputKey.S)).toBe('Ctrl-Shift-S');
    expect(readable(InputKey.Control, InputKey.O)).toBe('Ctrl-O');
  });

  it('uses the framework key names', () => {
    expect(readable(InputKey.Space)).toBe('Space');
    expect(readable(InputKey.Control)).toBe('Ctrl');
    expect(readable(InputKey.MouseMiddle)).toBe('M3');
    expect(readable(InputKey.None)).toBe('');
  });
});
