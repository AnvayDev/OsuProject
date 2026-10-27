// Ported from osu.Framework/Input/TextInputSource.cs, TextInputProperties.cs and TextInputType.cs
// (RectangleF ime rectangles are plain screen-space rectangles.)

import type { RectangleF } from '../layout/Primitives';

export enum TextInputType {
  Text,
  Name,
  Code,
  Number,
  Decimal,
  EmailAddress,
  Username,
  Password,
  NumericalPassword,
}

export function isPassword(type: TextInputType): boolean {
  return type === TextInputType.Password || type === TextInputType.NumericalPassword;
}

export function isNumerical(type: TextInputType): boolean {
  return type === TextInputType.Number || type === TextInputType.NumericalPassword || type === TextInputType.Decimal;
}

export function supportsIme(type: TextInputType): boolean {
  return type === TextInputType.Name || type === TextInputType.Text;
}

/** A set of properties to consider when interacting with text input. */
export interface TextInputProperties {
  readonly type: TextInputType;
  readonly allowIme?: boolean;
  readonly autoCapitalisation?: boolean;
}

/** Source of text input events. */
export class TextInputSource {
  private _imeActive = false;

  /** Whether IME is actively providing text composition through OnImeComposition and accepting input from the user. */
  get imeActive(): boolean {
    return this._imeActive;
  }

  private activationCounter = 0;

  /** Activates this TextInputSource. User text input can be acquired through onTextInput, onImeComposition and onImeResult. */
  activate(properties: TextInputProperties, imeRectangle: RectangleF): void {
    if (++this.activationCounter === 1) {
      this.setImeRectangle(imeRectangle);
      this.activateTextInput(properties);
    } else {
      // the latest consumer that activated should always take precedence in (dis)allowing IME.
      this.ensureActivated(properties, imeRectangle);
    }
  }

  /** Ensures that the native implementation that retrieves user text input is activated and that the user can start entering text. */
  ensureActivated(properties: TextInputProperties, imeRectangle: RectangleF | null = null): void {
    if (this.activationCounter >= 1) {
      if (imeRectangle !== null)
        this.setImeRectangle(imeRectangle);

      this.ensureTextInputActivated(properties);
    }
  }

  /** Deactivates this TextInputSource. */
  deactivate(): void {
    if (--this.activationCounter === 0)
      this.deactivateTextInput();
  }

  /** Sets where the native implementation displays IME controls and suggestions to the user. */
  setImeRectangle(_rectangle: RectangleF): void {
  }

  /** Resets IME composition state. */
  resetIme(): void {
    this._imeActive = false;
  }

  /** Invoked when text is committed by the user. */
  readonly onTextInput = new Set<(text: string) => void>();

  /** Invoked when IME composition starts or changes. Empty text means that composition isn't active. */
  readonly onImeComposition = new Set<(text: string, start: number, length: number) => void>();

  /** Invoked when IME composition successfully completes. */
  readonly onImeResult = new Set<(text: string) => void>();

  protected activateTextInput(_properties: TextInputProperties): void {
  }

  protected ensureTextInputActivated(_properties: TextInputProperties): void {
  }

  protected deactivateTextInput(): void {
  }

  protected triggerTextInput(text: string): void {
    for (const h of [...this.onTextInput]) h(text);
  }

  protected triggerImeComposition(text: string, start: number, length: number): void {
    // empty text means that composition isn't active.
    this._imeActive = text !== '';

    for (const h of [...this.onImeComposition]) h(text, start, length);
  }

  protected triggerImeResult(text: string): void {
    // IME is deactivated / not providing active composition once the current one is finalized.
    this._imeActive = false;

    for (const h of [...this.onImeResult]) h(text);
  }
}
