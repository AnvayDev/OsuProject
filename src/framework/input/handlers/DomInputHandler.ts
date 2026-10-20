// Replaces osu!framework's SDL-backed MouseHandler + KeyboardHandler (Input/Handlers/Mouse, Input/Handlers/Keyboard)
// with DOM events. Positions are CSS px relative to the mount element, which is the root's screen space.
//
// Scroll mapping follows SDL3Window.handleMouseWheelEvent / SDL3MacOSWindow:
//  - wheel notches are delta 1 per notch (Chrome/Edge report 100 px, Firefox 3 lines per notch) and not precise;
//  - pixel deltas that are not whole notches (trackpads) are precise, scaled like macOS: pixels * 0.1 / 8.
//  - osu! Y is positive when scrolling up (DOM deltaY is positive scrolling down); X is negated the same way SDL's is.

import { Vector2 } from '../../layout/Vector2';
import { InputHandler } from '../InputManager';
import { Key, keyFromDomCode, mouseButtonFromDom, type MouseButton } from '../Key';
import { KeyboardKeyInput, MouseButtonInput, MousePositionAbsoluteInput, MouseScrollRelativeInput } from '../StateChanges';

const precise_scroll_debounce = 100;
const mac_precise_scale_factor = 0.1 / 8;

/** Keys whose browser default action must stay available (reload, devtools, fullscreen). */
const passthroughKeys = new Set<Key>([Key.F5, Key.F11, Key.F12]);

export class DomInputHandler extends InputHandler {
  /** Whether the cursor is currently inside the page (UserInputManager.HandleHoverEvents). */
  cursorInWindow = true;

  private readonly pressedKeys = new Set<Key>();
  private readonly pressedButtons = new Set<MouseButton>();
  private lastPreciseScroll = -Infinity;

  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(private readonly element: HTMLElement) {
    super();

    const on = <K extends keyof WindowEventMap>(target: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.listeners.push([target, type, fn as EventListener, opts]);
    };

    on(window, 'pointermove', e => {
      this.cursorInWindow = true;
      for (const ev of (e.getCoalescedEvents?.() ?? [e]))
        this.enqueueInput(new MousePositionAbsoluteInput(this.toScreenSpace(ev)));
    });

    on(element, 'pointerdown', e => {
      this.enqueueInput(new MousePositionAbsoluteInput(this.toScreenSpace(e)));
      const button = mouseButtonFromDom(e.button);
      this.pressedButtons.add(button);
      this.enqueueInput(new MouseButtonInput(button, true));
      element.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });

    on(window, 'pointerup', e => {
      const button = mouseButtonFromDom(e.button);
      if (!this.pressedButtons.delete(button)) return;
      this.enqueueInput(new MousePositionAbsoluteInput(this.toScreenSpace(e)));
      this.enqueueInput(new MouseButtonInput(button, false));
    });

    on(document.documentElement, 'pointerleave', () => (this.cursorInWindow = false));
    on(document.documentElement, 'pointerenter', () => (this.cursorInWindow = true));

    on(element, 'contextmenu', e => e.preventDefault());

    on(element, 'wheel', e => {
      e.preventDefault();
      this.enqueueInput(this.scrollInput(e));
    }, { passive: false });

    on(window, 'keydown', e => {
      const key = keyFromDomCode(e.code);
      if (key === Key.Unknown) return;

      // let text inputs receive their keys (osu! TextBox handles text through the platform text input path).
      if (isEditable(e.target)) return;

      if (!passthroughKeys.has(key) && !(e.ctrlKey || e.metaKey))
        e.preventDefault();

      if (e.repeat) return; // the InputManager synthesises key repeat itself (250 ms / 70 ms).

      this.pressedKeys.add(key);
      this.enqueueInput(new KeyboardKeyInput(key, true));
    });

    on(window, 'keyup', e => {
      const key = keyFromDomCode(e.code);
      if (!this.pressedKeys.delete(key)) return;
      this.enqueueInput(new KeyboardKeyInput(key, false));
    });

    // Releases can't be received while the page is unfocused; release everything (like losing window focus in SDL).
    on(window, 'blur', () => this.releaseAll());
  }

  private toScreenSpace(e: { clientX: number; clientY: number }): Vector2 {
    const rect = this.element.getBoundingClientRect();
    return new Vector2(e.clientX - rect.left, e.clientY - rect.top);
  }

  private scrollInput(e: WheelEvent): MouseScrollRelativeInput {
    let dx = e.deltaX;
    let dy = e.deltaY;

    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      dx /= 3;
      dy /= 3;
    } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      dx *= 3;
      dy *= 3;
    } else {
      const notch = (v: number) => v !== 0 && Number.isInteger(v / 100);
      const isNotch = (dx === 0 || notch(dx)) && (dy === 0 || notch(dy)) && (dx !== 0 || dy !== 0);

      if (!isNotch) {
        this.lastPreciseScroll = e.timeStamp;
        return new MouseScrollRelativeInput(new Vector2(-dx * mac_precise_scale_factor, -dy * mac_precise_scale_factor), true);
      }

      dx /= 100;
      dy /= 100;
    }

    const precise = e.timeStamp < this.lastPreciseScroll + precise_scroll_debounce;
    return new MouseScrollRelativeInput(new Vector2(-dx, -dy), precise);
  }

  private releaseAll(): void {
    for (const key of this.pressedKeys)
      this.enqueueInput(new KeyboardKeyInput(key, false));
    this.pressedKeys.clear();

    for (const button of this.pressedButtons)
      this.enqueueInput(new MouseButtonInput(button, false));
    this.pressedButtons.clear();
  }

  dispose(): void {
    for (const [target, type, fn, opts] of this.listeners)
      target.removeEventListener(type, fn, opts);
    this.listeners.length = 0;
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
