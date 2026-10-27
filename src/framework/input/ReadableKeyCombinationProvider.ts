// Ported from osu.Framework/Input/ReadableKeyCombinationProvider.cs (+ Platform/MacOS/MacOSReadableKeyCombinationProvider.cs; InputKey's [Order]
// attributes for EnumExtensions.GetValuesInOrder).
// The SDL layer (key names from the system keyboard layout) is not available in a browser: keys use the framework's own names. Joystick,
// MIDI and tablet keys don't exist in the web InputKey.

import { Platform, RuntimeInfo } from '../RuntimeInfo';
import { InputKey, type KeyCombination } from './bindings/KeyBindings';

/** InputKey's [Order] values (HasOrderedElements with AllowPartialOrdering: other keys order by value). */
const keyOrder = (key: InputKey): number => {
  switch (key) {
    case InputKey.Control: case InputKey.LControl: case InputKey.RControl: return 1;
    case InputKey.Alt: case InputKey.LAlt: case InputKey.RAlt: return 2;
    case InputKey.Shift: case InputKey.LShift: case InputKey.RShift: return 3;
    case InputKey.Super: case InputKey.LSuper: case InputKey.RSuper: return 4;
    default: return key;
  }
};

const readableNames: Partial<Record<InputKey, string>> = {
  [InputKey.None]: '',
  [InputKey.Shift]: 'Shift',
  [InputKey.Control]: 'Ctrl',
  [InputKey.Alt]: 'Alt',
  [InputKey.Super]: 'Win',
  [InputKey.LShift]: 'LShift',
  [InputKey.LControl]: 'LCtrl',
  [InputKey.LAlt]: 'LAlt',
  [InputKey.LSuper]: 'LWin',
  [InputKey.RShift]: 'RShift',
  [InputKey.RControl]: 'RCtrl',
  [InputKey.RAlt]: 'RAlt',
  [InputKey.RSuper]: 'RWin',
  [InputKey.Escape]: 'Esc',
  [InputKey.BackSpace]: 'Backsp',
  [InputKey.Insert]: 'Ins',
  [InputKey.Delete]: 'Del',
  [InputKey.PageUp]: 'PgUp',
  [InputKey.PageDown]: 'PgDn',
  [InputKey.CapsLock]: 'Caps',
  [InputKey.Keypad0]: 'Numpad0',
  [InputKey.Keypad1]: 'Numpad1',
  [InputKey.Keypad2]: 'Numpad2',
  [InputKey.Keypad3]: 'Numpad3',
  [InputKey.Keypad4]: 'Numpad4',
  [InputKey.Keypad5]: 'Numpad5',
  [InputKey.Keypad6]: 'Numpad6',
  [InputKey.Keypad7]: 'Numpad7',
  [InputKey.Keypad8]: 'Numpad8',
  [InputKey.Keypad9]: 'Numpad9',
  [InputKey.KeypadDivide]: 'NumpadDivide',
  [InputKey.KeypadMultiply]: 'NumpadMultiply',
  [InputKey.KeypadMinus]: 'NumpadMinus',
  [InputKey.KeypadPlus]: 'NumpadPlus',
  [InputKey.KeypadDecimal]: 'NumpadDecimal',
  [InputKey.KeypadEnter]: 'NumpadEnter',
  [InputKey.Number0]: '0',
  [InputKey.Number1]: '1',
  [InputKey.Number2]: '2',
  [InputKey.Number3]: '3',
  [InputKey.Number4]: '4',
  [InputKey.Number5]: '5',
  [InputKey.Number6]: '6',
  [InputKey.Number7]: '7',
  [InputKey.Number8]: '8',
  [InputKey.Number9]: '9',
  [InputKey.Tilde]: '~',
  [InputKey.Minus]: 'Minus',
  [InputKey.Plus]: 'Plus',
  [InputKey.BracketLeft]: '[',
  [InputKey.BracketRight]: ']',
  [InputKey.Semicolon]: ';',
  [InputKey.Quote]: '"',
  [InputKey.Comma]: ',',
  [InputKey.Period]: '.',
  [InputKey.Slash]: '/',
  [InputKey.BackSlash]: '\\',
  [InputKey.NonUSBackSlash]: '\\',
  [InputKey.Mute]: 'Mute',
  [InputKey.VolumeDown]: 'Vol. Down',
  [InputKey.VolumeUp]: 'Vol. Up',
  [InputKey.Stop]: 'Media Stop',
  [InputKey.PlayPause]: 'Media Play',
  [InputKey.TrackNext]: 'Media Next',
  [InputKey.TrackPrevious]: 'Media Previous',
  [InputKey.MouseLeft]: 'M1',
  [InputKey.MouseMiddle]: 'M3',
  [InputKey.MouseRight]: 'M2',
  [InputKey.ExtraMouseButton1]: 'M4',
  [InputKey.ExtraMouseButton2]: 'M5',
  [InputKey.ExtraMouseButton3]: 'M6',
  [InputKey.ExtraMouseButton4]: 'M7',
  [InputKey.ExtraMouseButton5]: 'M8',
  [InputKey.ExtraMouseButton6]: 'M9',
  [InputKey.ExtraMouseButton7]: 'M10',
  [InputKey.ExtraMouseButton8]: 'M11',
  [InputKey.ExtraMouseButton9]: 'M12',
  [InputKey.MouseWheelDown]: 'Wheel Down',
  [InputKey.MouseWheelUp]: 'Wheel Up',
  [InputKey.MouseWheelLeft]: 'Wheel Left',
  [InputKey.MouseWheelRight]: 'Wheel Right',
};

export class ReadableKeyCombinationProvider {
  /** Returns a human-readable string for a given KeyCombination. */
  getReadableString(c: KeyCombination): string {
    const sortedKeys = [...c.keys].sort((a, b) => keyOrder(a) - keyOrder(b));

    return sortedKeys.map(key => {
      switch (key) {
        case InputKey.Control:
          if (sortedKeys.includes(InputKey.LControl) || sortedKeys.includes(InputKey.RControl))
            return null;

          break;

        case InputKey.Shift:
          if (sortedKeys.includes(InputKey.LShift) || sortedKeys.includes(InputKey.RShift))
            return null;

          break;

        case InputKey.Alt:
          if (sortedKeys.includes(InputKey.LAlt) || sortedKeys.includes(InputKey.RAlt))
            return null;

          break;

        case InputKey.Super:
          if (sortedKeys.includes(InputKey.LSuper) || sortedKeys.includes(InputKey.RSuper))
            return null;

          break;
      }

      return this.getReadableKey(key);
    }).filter((s): s is string => s !== null && s !== '').join('-');
  }

  protected getReadableKey(key: InputKey): string {
    // MacOSReadableKeyCombinationProvider
    if (RuntimeInfo.OS === Platform.macOS) {
      switch (key) {
        case InputKey.Super:
          return 'Cmd';

        case InputKey.Alt:
          return 'Opt';
      }
    }

    return readableNames[key] ?? InputKey[key];
  }
}
