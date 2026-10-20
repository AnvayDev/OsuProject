// A C#-style multicast event: `event Action<T> X;` with `X += h` → `x.add(h)`, `X -= h` → `x.remove(h)`, `X?.Invoke(v)` → `x.emit(v)`.
// Like a delegate invocation, emit() runs the handlers that were subscribed when it started.

export class Signal<T = void> {
  private handlers: ((value: T) => void)[] = [];

  add(handler: (value: T) => void): void {
    this.handlers = [...this.handlers, handler];
  }

  /** Removes the last subscription of the handler (C# delegate removal semantics). */
  remove(handler: (value: T) => void): void {
    const i = this.handlers.lastIndexOf(handler);
    if (i >= 0) this.handlers = [...this.handlers.slice(0, i), ...this.handlers.slice(i + 1)];
  }

  emit(value: T): void {
    for (const h of this.handlers) h(value);
  }

  /** `X = null` */
  clear(): void {
    this.handlers = [];
  }

  get hasHandlers(): boolean {
    return this.handlers.length > 0;
  }
}
