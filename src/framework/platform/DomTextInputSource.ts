// Web text input backend: replaces osu!framework's SDL3WindowTextInput (SDL text input + IME events) with a hidden <textarea>.
// While active the textarea holds DOM focus, so the browser delivers typed text ('input') and IME composition ('composition*') to it;
// key events still reach the game through DomInputHandler, which lets keys typed into this element keep their default (text-producing) action.
// The textarea is emptied after every input, so it never accumulates text: the TextBox owns the text, as with SDL.
// The IME rectangle positions the textarea so the browser's IME candidate window appears at the text.

import type { RectangleF } from '../layout/Primitives';
import { TextInputSource, type TextInputProperties } from '../input/TextInputSource';

/** Marks the element DomInputHandler treats as the game's own text input. */
export const TEXT_INPUT_ATTRIBUTE = 'data-osu-text-input';

export class DomTextInputSource extends TextInputSource {
  private readonly textarea: HTMLTextAreaElement;

  private composing = false;

  constructor(private readonly mount: HTMLElement) {
    super();

    const t = this.textarea = document.createElement('textarea');
    t.setAttribute(TEXT_INPUT_ATTRIBUTE, '');
    t.setAttribute('autocomplete', 'off');
    t.setAttribute('autocorrect', 'off');
    t.setAttribute('autocapitalize', 'off');
    t.spellcheck = false;
    t.tabIndex = -1;
    Object.assign(t.style, {
      position: 'fixed', left: '0px', top: '0px', width: '1px', height: '1px', padding: '0', border: '0', margin: '0',
      opacity: '0', resize: 'none', overflow: 'hidden', pointerEvents: 'none', zIndex: '-1',
    });

    t.addEventListener('input', e => {
      if (this.composing || (e as InputEvent).isComposing) return;

      // (SDL produces no text for Enter / Tab; drop line breaks the textarea inserts.)
      const text = t.value.replace(/[\r\n]/g, '');
      t.value = '';

      if (text !== '')
        this.triggerTextInput(text);
    });

    t.addEventListener('compositionstart', () => {
      this.composing = true;
    });

    t.addEventListener('compositionupdate', e => {
      // (browsers don't report the IME's selection within the composition: the caret is at its end.)
      this.triggerImeComposition(e.data, e.data.length, 0);
    });

    t.addEventListener('compositionend', e => {
      this.composing = false;
      t.value = '';
      this.triggerImeResult(e.data);
    });

    mount.appendChild(t);
  }

  override setImeRectangle(rectangle: RectangleF): void {
    const mountRect = this.mount.getBoundingClientRect();
    this.textarea.style.left = `${mountRect.left + rectangle.x}px`;
    this.textarea.style.top = `${mountRect.top + rectangle.y}px`;
    this.textarea.style.height = `${Math.max(1, rectangle.height)}px`;
  }

  override resetIme(): void {
    // blurring ends (commits away) any ongoing composition; text input stays active.
    if (this.composing) {
      this.composing = false;
      this.textarea.blur();
      this.textarea.value = '';
      this.textarea.focus({ preventScroll: true });
    }

    super.resetIme();
  }

  protected override activateTextInput(_properties: TextInputProperties): void {
    this.textarea.value = '';
    this.textarea.focus({ preventScroll: true });
  }

  protected override ensureTextInputActivated(_properties: TextInputProperties): void {
    if (document.activeElement !== this.textarea)
      this.textarea.focus({ preventScroll: true });
  }

  protected override deactivateTextInput(): void {
    this.composing = false;
    this.textarea.value = '';
    this.textarea.blur();
  }
}
