// Ported from osu.Framework/Platform/Clipboard.cs (text only), with the web implementation.
// The async Clipboard API can't be read synchronously, so getText() returns null: pastes arrive as text input instead (the browser pastes
// into DomTextInputSource's textarea), which TextBox already handles (its textInputBlocking path for platforms pasting at the OS level).

/** This class allows placing and retrieving data from the clipboard. */
export abstract class Clipboard {
  /** Retrieve text from the clipboard. */
  abstract getText(): string | null;

  /** Copy text to the clipboard. */
  abstract setText(text: string): void;
}

export class DomClipboard extends Clipboard {
  getText(): string | null {
    return null;
  }

  setText(text: string): void {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }
}
