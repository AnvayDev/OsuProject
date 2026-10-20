import { describe, expect, it } from 'vitest';
import { createHost } from './testHost';
import { Box } from '@fw/graphics/shapes/Box';
import { Container } from '@fw/graphics/containers/Container';
import { Anchor, Axes, FillMode } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Colour4 } from '@fw/graphics/Colour4';
import { Easing } from '@fw/transforms/Easing';

const quad = (d: Box | Container) => d.screenSpaceDrawQuad;

describe('Drawable layout (DrawInfo)', () => {
  it('anchor + origin centre places the box in the middle', () => {
    const { root, frame } = createHost(1000, 800);
    const box = new Box().with({ anchor: Anchor.Centre, origin: Anchor.Centre, size: new Vector2(100, 50) });
    root.add(box);
    frame();
    expect(quad(box).topLeft.equals(new Vector2(450, 375))).toBe(true);
    expect(quad(box).bottomRight.equals(new Vector2(550, 425))).toBe(true);
  });

  it('relative size and position', () => {
    const { root, frame } = createHost(1000, 800);
    const box = new Box().with({ relativeSizeAxes: Axes.Both, relativePositionAxes: Axes.X, size: new Vector2(0.5, 0.25), x: 0.1 });
    root.add(box);
    frame();
    expect(box.drawSize.equals(new Vector2(500, 200))).toBe(true);
    expect(quad(box).topLeft.x).toBeCloseTo(100);
  });

  it('padding offsets and shrinks the child space', () => {
    const { root, frame } = createHost(1000, 800);
    const box = new Box().with({ relativeSizeAxes: Axes.Both });
    const c = new Container().with({ relativeSizeAxes: Axes.Both, padding: MarginPadding.of({ horizontal: 10, top: 20 }), children: [box] });
    root.add(c);
    frame();
    expect(box.drawSize.equals(new Vector2(980, 780))).toBe(true);
    expect(quad(box).topLeft.equals(new Vector2(10, 20))).toBe(true);
  });

  it('scale and rotation happen around the origin', () => {
    const { root, frame } = createHost(1000, 800);
    const box = new Box().with({ origin: Anchor.Centre, position: new Vector2(100, 100), size: new Vector2(20, 10), scale: new Vector2(2), rotation: 90 });
    root.add(box);
    frame();
    const aabb = quad(box).aabbFloat;
    expect(aabb.x).toBeCloseTo(90);
    expect(aabb.y).toBeCloseTo(80);
    expect(aabb.width).toBeCloseTo(20);
    expect(aabb.height).toBeCloseTo(40);
    expect(box.element.style.transform).toMatch(/^matrix\(/);
  });

  it('fill modes', () => {
    const { root, frame } = createHost(1000, 500);
    const fit = new Box().with({ relativeSizeAxes: Axes.Both, fillMode: FillMode.Fit, fillAspectRatio: 1 });
    const fill = new Box().with({ relativeSizeAxes: Axes.Both, fillMode: FillMode.Fill, fillAspectRatio: 1 });
    root.add(fit);
    root.add(fill);
    frame();
    expect(fit.drawSize.equals(new Vector2(500, 500))).toBe(true);
    expect(fill.drawSize.equals(new Vector2(1000, 1000))).toBe(true);
  });

  it('autosize follows children and margins', () => {
    const { root, frame } = createHost();
    const box = new Box().with({ size: new Vector2(100, 40), margin: new MarginPadding(5) });
    const c = new Container().with({ autoSizeAxes: Axes.Both, padding: new MarginPadding(10), children: [box] });
    root.add(c);
    frame();
    expect(c.drawSize.equals(new Vector2(130, 70))).toBe(true);
    box.width = 200;
    frame();
    expect(c.drawSize.x).toBe(230);
  });

  it('autosize with duration animates the size', () => {
    const { root, frame } = createHost();
    const box = new Box().with({ size: new Vector2(100, 100) });
    const c = new Container().with({ autoSizeAxes: Axes.X, height: 100, autoSizeDuration: 100, autoSizeEasing: Easing.None, children: [box] });
    root.add(c);
    frame();
    frame(200);
    expect(c.drawWidth).toBe(100);
    box.width = 200;
    frame(0);
    frame(50);
    expect(c.drawWidth).toBeCloseTo(150, 0);
    frame(100);
    expect(c.drawWidth).toBe(200);
  });
});

describe('Drawable colour / presence / DOM', () => {
  it('alpha multiplies down the tree into leaf colours (no CSS opacity on containers)', () => {
    const { root, frame } = createHost();
    const box = new Box().with({ size: new Vector2(10), colour: Colour4.Red, alpha: 0.5 });
    const c = new Container().with({ autoSizeAxes: Axes.Both, alpha: 0.5, children: [box] });
    root.add(c);
    frame();
    expect(box.drawColourInfo.colour.topLeft.a).toBeCloseTo(0.25);
    expect(c.element.style.opacity).toBe('');
    expect(box.element.style.background).toContain('rgba(255, 0, 0, 0.25)');
  });

  it('non-present drawables are not displayed, and DOM order follows depth', () => {
    const { root, frame } = createHost();
    const a = new Box().with({ depth: 1 });
    const b = new Box().with({ depth: 0 });
    root.add(b);
    root.add(a);
    frame();
    expect(root.element.firstChild).toBe(a.element); // higher depth draws first (behind)
    b.alpha = 0;
    frame();
    expect(b.element.style.display).toBe('none');
    b.fadeIn(100);
    frame(50);
    expect(b.element.style.display).toBe('');
  });

  it('lifetime controls aliveness', () => {
    const { root, frame, clock } = createHost();
    const box = new Box().with({ lifetimeStart: clock.currentTime + 100 });
    root.add(box);
    frame();
    expect(box.isAlive).toBe(false);
    frame(150);
    expect(box.isAlive).toBe(true);
    box.fadeOut(100).expire();
    frame(150);
    frame(1);
    expect(root.children).not.toContain(box);
  });

  it('delayed sequences on containers propagate to children (recursive)', () => {
    const { root, frame } = createHost();
    const box = new Box();
    const c = new Container().with({ children: [box] });
    root.add(c);
    frame();
    {
      using _ = c.beginDelayedSequence(100);
      box.fadeOut(100);
    }
    frame(100);
    expect(box.alpha).toBe(1);
    frame(50);
    expect(box.alpha).toBeCloseTo(0.5);
  });

  it('sequence helpers chain like TransformSequenceExtensions', () => {
    const { root, frame } = createHost();
    const box = new Box();
    root.add(box);
    frame();
    box.fadeOut(100).then().fadeIn(100).moveToX(50, 100);
    frame(150);
    expect(box.alpha).toBeCloseTo(0.5);
    expect(box.x).toBeCloseTo(25);
  });
});
