import { describe, expect, it } from 'vitest';
import { createHost } from './testHost';
import { Box } from '@fw/graphics/shapes/Box';
import { Container } from '@fw/graphics/containers/Container';
import { Vector2 } from '@fw/layout/Vector2';

function setup() {
  const host = createHost();
  const box = new Box().with({ position: new Vector2(100, 50), size: new Vector2(20, 20) });
  const a = new Container().with({ position: new Vector2(10, 10), size: new Vector2(200, 200), child: box });
  const b = new Container().with({ position: new Vector2(300, 200), size: new Vector2(200, 200) });
  host.root.add(a);
  host.root.add(b);
  const proxy = box.createProxy();
  b.add(proxy);
  host.frame();
  return { ...host, box, a, b, proxy };
}

describe('ProxyDrawable', () => {
  it('draws the original at the proxy\'s place in the draw order, at the original\'s screen position', () => {
    const { box, proxy, b } = setup();
    expect(box.isProxy).toBe(false);
    expect(proxy.isProxy).toBe(true);
    expect(proxy.original).toBe(box);
    expect(box.element.parentNode).toBe(proxy.element);
    expect(proxy.element.parentNode).toBe(b.element);
    expect(box.element.style.display).toBe('');
    // (10 + 100, 10 + 50) relative to the proxy at (300, 200)
    expect(box.element.style.transform.replace(/\s/g, '')).toBe('matrix(1,0,0,1,-190,-140)');
    expect(box.screenSpaceDrawQuad.topLeft.equals(new Vector2(110, 60))).toBe(true);
  });

  it('follows the original\'s position', () => {
    const { box, a, frame } = setup();
    a.x = 50;
    frame();
    expect(box.element.style.transform.replace(/\s/g, '')).toBe('matrix(1,0,0,1,-150,-140)');
  });

  it('only shows the original on frames where it was drawn in its own tree', () => {
    const { box, a, frame } = setup();
    box.alpha = 0;
    frame();
    expect(box.element.style.display).toBe('none');

    box.alpha = 1;
    a.alpha = 0;
    frame();
    expect(box.element.style.display).toBe('none');

    a.alpha = 1;
    frame();
    expect(box.element.style.display).toBe('');
  });

  it('forwards lifetime and presence', () => {
    const { box, proxy } = setup();
    box.lifetimeEnd = 1234;
    expect(proxy.lifetimeEnd).toBe(1234);
    expect(proxy.isPresent).toBe(false);
  });

  it('a proxy of a proxy draws the first original', () => {
    const { box, proxy, root, frame } = setup();
    const c = new Container().with({ size: new Vector2(10, 10) });
    root.add(c);
    const proxy2 = proxy.createProxy();
    c.add(proxy2);
    frame();
    expect(box.element.parentNode).toBe(proxy2.element);
    expect(box.element.style.display).toBe('');
    expect(box.element.style.transform.replace(/\s/g, '')).toBe('matrix(1,0,0,1,110,60)');
  });
});
