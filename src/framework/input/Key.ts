// osuTK.Input.Key (the members osu! and osu!framework use) and osuTK.Input.MouseButton, plus the DOM mapping.
// Left/right modifier aliases follow osuTK (LShift == ShiftLeft, ...).

export enum MouseButton {
  Left,
  Middle,
  Right,
  Button1,
  Button2,
  Button3,
  Button4,
  Button5,
  Button6,
  Button7,
  Button8,
  Button9,
  LastButton,
}

export enum Key {
  Unknown = 0,
  ShiftLeft = 1, LShift = 1,
  ShiftRight = 2, RShift = 2,
  ControlLeft = 3, LControl = 3,
  ControlRight = 4, RControl = 4,
  AltLeft = 5, LAlt = 5,
  AltRight = 6, RAlt = 6,
  WinLeft = 7, LWin = 7,
  WinRight = 8, RWin = 8,
  Menu = 9,
  F1 = 10, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, F24, F25, F26, F27, F28, F29, F30, F31, F32, F33, F34, F35,
  Up = 45, Down, Left, Right,
  Enter = 49,
  Escape = 50,
  Space = 51,
  Tab = 52,
  BackSpace = 53, Back = 53,
  Insert = 54,
  Delete = 55,
  PageUp = 56,
  PageDown = 57,
  Home = 58,
  End = 59,
  CapsLock = 60,
  ScrollLock = 61,
  PrintScreen = 62,
  Pause = 63,
  NumLock = 64,
  Clear = 65,
  Sleep = 66,
  Keypad0 = 67, Keypad1, Keypad2, Keypad3, Keypad4, Keypad5, Keypad6, Keypad7, Keypad8, Keypad9,
  KeypadDivide = 77, KeypadMultiply, KeypadSubtract, KeypadMinus = 79, KeypadAdd = 80, KeypadPlus = 80, KeypadDecimal = 81, KeypadPeriod = 81, KeypadEnter = 82,
  A = 83, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
  Number0 = 109, Number1, Number2, Number3, Number4, Number5, Number6, Number7, Number8, Number9,
  Tilde = 119, Grave = 119,
  Minus = 120,
  Plus = 121,
  BracketLeft = 122, LBracket = 122,
  BracketRight = 123, RBracket = 123,
  Semicolon = 124,
  Quote = 125,
  Comma = 126,
  Period = 127,
  Slash = 128,
  BackSlash = 129,
  NonUSBackSlash = 130,
  LastKey = 131,
  // media keys (osu!framework's osuTK fork; values equal InputKey's so KeyCombination.FromKey can cast)
  Mute = 256,
  PlayPause = 257,
  Stop = 258,
  VolumeUp = 259,
  VolumeDown = 260,
  TrackPrevious = 261,
  TrackNext = 262,
}

const codeMap: Record<string, Key> = {
  ShiftLeft: Key.LShift, ShiftRight: Key.RShift, ControlLeft: Key.LControl, ControlRight: Key.RControl,
  AltLeft: Key.LAlt, AltRight: Key.RAlt, MetaLeft: Key.LWin, MetaRight: Key.RWin, OSLeft: Key.LWin, OSRight: Key.RWin, ContextMenu: Key.Menu,
  ArrowUp: Key.Up, ArrowDown: Key.Down, ArrowLeft: Key.Left, ArrowRight: Key.Right,
  Enter: Key.Enter, Escape: Key.Escape, Space: Key.Space, Tab: Key.Tab, Backspace: Key.BackSpace,
  Insert: Key.Insert, Delete: Key.Delete, PageUp: Key.PageUp, PageDown: Key.PageDown, Home: Key.Home, End: Key.End,
  CapsLock: Key.CapsLock, ScrollLock: Key.ScrollLock, PrintScreen: Key.PrintScreen, Pause: Key.Pause, NumLock: Key.NumLock,
  NumpadDivide: Key.KeypadDivide, NumpadMultiply: Key.KeypadMultiply, NumpadSubtract: Key.KeypadSubtract, NumpadAdd: Key.KeypadAdd,
  NumpadDecimal: Key.KeypadDecimal, NumpadEnter: Key.KeypadEnter,
  Backquote: Key.Tilde, Minus: Key.Minus, Equal: Key.Plus, BracketLeft: Key.BracketLeft, BracketRight: Key.BracketRight,
  Semicolon: Key.Semicolon, Quote: Key.Quote, Comma: Key.Comma, Period: Key.Period, Slash: Key.Slash, Backslash: Key.BackSlash, IntlBackslash: Key.NonUSBackSlash,
  AudioVolumeMute: Key.Mute, MediaPlayPause: Key.PlayPause, MediaStop: Key.Stop, AudioVolumeUp: Key.VolumeUp, AudioVolumeDown: Key.VolumeDown,
  MediaTrackPrevious: Key.TrackPrevious, MediaTrackNext: Key.TrackNext,
};

/** Maps KeyboardEvent.code (physical key, like SDL scancodes) to Key. */
export function keyFromDomCode(code: string): Key {
  const mapped = codeMap[code];
  if (mapped !== undefined) return mapped;

  let m = /^Key([A-Z])$/.exec(code);
  if (m) return Key.A + (m[1].charCodeAt(0) - 65);

  m = /^Digit([0-9])$/.exec(code);
  if (m) return Key.Number0 + Number(m[1]);

  m = /^Numpad([0-9])$/.exec(code);
  if (m) return Key.Keypad0 + Number(m[1]);

  m = /^F([0-9]{1,2})$/.exec(code);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 35) return Key.F1 + Number(m[1]) - 1;

  return Key.Unknown;
}

/** Maps MouseEvent.button to MouseButton. */
export function mouseButtonFromDom(button: number): MouseButton {
  switch (button) {
    case 0: return MouseButton.Left;
    case 1: return MouseButton.Middle;
    case 2: return MouseButton.Right;
    case 3: return MouseButton.Button1;
    case 4: return MouseButton.Button2;
    default: return MouseButton.Button3;
  }
}
