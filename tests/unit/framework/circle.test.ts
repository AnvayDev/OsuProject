import { describe, expect, it } from 'vitest';
import { Component } from '@fw/graphics/Component';
import { Drawable } from '@fw/graphics/Drawable';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { Box } from '@fw/graphics/shapes/Box';
import { Circle } from '@fw/graphics/shapes/Circle';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { createHost } from './testHost';

class InternalChildren extends Circle {
  get all() {
    return this.internalChildren;
  }
}

describe('Circle / CircularContainer', () => {
  it('Circle masks and fills itself with a relatively sized Box', () => {
    const c = new InternalChildren();
    expect(c.masking).toBe(true);
    expect(c.all).toHaveLength(1);
    expect(c.all[0]).toBeInstanceOf(Box);
    expect(c.all[0].relativeSizeAxes).toBe(Axes.Both);
  });

  it('CircularContainer does not enable masking itself (only Circle does, as in C#)', () => {
    expect(new CircularContainer().masking).toBe(false);
  });

  it('corner radius follows min(DrawSize)/2 once drawn, and is updated when resized', () => {
    const { root, frame } = createHost();
    const c = new Circle().with({ size: new Vector2(100, 40) });
    root.add(c);

    expect(c.cornerRadius).toBe(0); // only set while generating the draw tree (GenerateDrawNodeSubtree)
    frame();
    expect(c.cornerRadius).toBe(20);

    const mask = c.element.firstElementChild as HTMLElement;
    expect(mask.style.borderRadius).toBe('20px');

    c.width = 30;
    frame();
    expect(c.cornerRadius).toBe(15);
    expect(mask.style.borderRadius).toBe('15px');
  });

  it('uses the relative draw size', () => {
    const { root, frame } = createHost(1000, 800);
    const c = new CircularContainer().with({ relativeSizeAxes: Axes.Both, size: new Vector2(0.5, 0.25), masking: true });
    root.add(c);
    frame();
    expect(c.cornerRadius).toBe(100);
  });

  it('a circle receives input only inside its rounded shape', () => {
    const { root, frame } = createHost();
    const c = new Circle().with({ size: new Vector2(100, 100) });
    root.add(c);
    frame();

    expect(c.contains(new Vector2(50, 50))).toBe(true);
    expect(c.contains(new Vector2(2, 2))).toBe(false); // square corner, outside the circle
    expect(c.contains(new Vector2(50, 1))).toBe(true);
  });
});

describe('Component / Drawable.Empty()', () => {
  it('emptyDrawable creates a fresh, plain Drawable each time', () => {
    const a = emptyDrawable();
    const b = emptyDrawable();
    expect(a).toBeInstanceOf(Drawable);
    expect(a).not.toBe(b);
    expect(a.size.equals(Vector2.Zero)).toBe(true);
  });

  it('empty drawables and components can live in the hierarchy', () => {
    class TestComponent extends Component {
      updates = 0;
      protected override update() { this.updates++; }
    }

    const { root, frame } = createHost();
    const e = emptyDrawable();
    const c = new TestComponent();
    root.add(e);
    root.add(c);
    frame();
    frame();

    expect(e.isLoaded).toBe(true);
    expect(c.updates).toBe(2);
  });
});
