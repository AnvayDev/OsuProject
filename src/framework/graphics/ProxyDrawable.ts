// Ported from osu.Framework/Graphics/Drawable.ProxyDrawable.cs
//
// DOM: the proxy's element adopts the (ultimate) original's element, so the original is drawn at the proxy's place in the draw order,
// inside the proxy's ancestors' masking/compositing, but with the original's own screen-space DrawInfo (positioned relative to the proxy).
// As with ProxyDrawNode, it is only shown on frames where the original was validated (drawn) in its own tree.

import { Drawable } from './Drawable';

class ProxyDrawable extends Drawable {
  /** DrawNodeValidationId: the element frame in which the original was last validated. */
  private validatedFrame = -1;

  private readonly _original: Drawable;

  constructor(original: Drawable) {
    super();

    this._original = original;

    original.lifetimeChanged.add(() => this.lifetimeChanged.emit(this));

    const target = this.ultimateOriginal;
    target.element.style.display = 'none';
    this.element.appendChild(target.element);
  }

  /** originalDrawNodes: a proxy of a proxy draws the first original. */
  private get ultimateOriginal(): Drawable {
    let d: Drawable = this._original;
    while (d instanceof ProxyDrawable)
      d = d._original;
    return d;
  }

  override validateProxyDrawNode(): void {
    if (this.hasProxy) {
      // Proxy of a proxy - forward the next proxy
      super.validateProxyDrawNode();
      return;
    }

    this.validatedFrame = Drawable.elementFrame;
  }

  override get original(): Drawable {
    return this._original;
  }

  override get removeWhenNotAlive(): boolean {
    return this._original.removeWhenNotAlive;
  }

  override get shouldBeAlive(): boolean {
    return this._original.shouldBeAlive;
  }

  override get lifetimeStart(): number {
    return this._original.lifetimeStart;
  }

  override set lifetimeStart(value: number) {
    super.lifetimeStart = value;
  }

  override get lifetimeEnd(): number {
    return this._original.lifetimeEnd;
  }

  override set lifetimeEnd(value: number) {
    super.lifetimeEnd = value;
  }

  // We do not want to receive updates. That is the business of the original drawable.
  override get isPresent(): boolean {
    return false;
  }

  override updateSubTreeMasking(): boolean {
    return true;
  }

  // ProxyDrawNode: proxies walked (drawn) this frame show their original if it was validated this frame.
  override validateElement(): void {
    super.validateElement();

    if (!this.hasProxy)
      drawnProxies.push(this);
  }

  /** @internal */
  flush(): void {
    const target = this.ultimateOriginal;
    const el = target.element;

    if (el.parentNode !== this.element)
      this.element.appendChild(el);

    const visible = this.validatedFrame === Drawable.elementFrame && !target.isDisposed;
    const display = visible ? '' : 'none';
    if (el.style.display !== display)
      el.style.display = display;

    if (visible)
      target.applyProxiedElementPosition(this);
  }
}

const drawnProxies: ProxyDrawable[] = [];

Drawable.proxyFactory = original => new ProxyDrawable(original);

Drawable.flushProxies = () => {
  for (const p of drawnProxies)
    p.flush();

  drawnProxies.length = 0;
};
