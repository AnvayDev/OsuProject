// Ported from osu.Framework/Allocation/InvokeOnDisposal.cs
// Supports both `using x = ...;` (explicit resource management) and manual `.dispose()`.

// Safari < 26 lacks Symbol.dispose; this is the same fallback TypeScript's and esbuild's `using` helpers look for.
(Symbol as { dispose?: symbol }).dispose ??= Symbol.for('Symbol.dispose');

export class InvokeOnDisposal implements Disposable {
  constructor(private readonly action: () => void) {}

  dispose(): void {
    this.action();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}
