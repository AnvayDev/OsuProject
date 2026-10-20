import { describe, expect, it } from 'vitest';
import { createHost } from './testHost';
import { Box } from '@fw/graphics/shapes/Box';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';

const box = (w: number, h: number, extra: Partial<Box> = {}) => new Box().with({ size: new Vector2(w, h), ...extra });
const xs = (flow: FillFlowContainer) => flow.children.map(c => c.x);
const ys = (flow: FillFlowContainer) => flow.children.map(c => c.y);

describe('FillFlowContainer', () => {
  it('flows horizontally with spacing and autosizes', () => {
    const { root, frame } = createHost();
    const flow = new FillFlowContainer().with({
      direction: FillDirection.Horizontal, autoSizeAxes: Axes.Both, spacing: new Vector2(10, 0),
      children: [box(50, 20), box(50, 20), box(50, 30)],
    });
    root.add(flow);
    frame();
    expect(xs(flow)).toEqual([0, 60, 120]);
    expect(ys(flow)).toEqual([0, 0, 0]);
    expect(flow.drawSize.equals(new Vector2(170, 30))).toBe(true);
  });

  it('flows vertically', () => {
    const { root, frame } = createHost();
    const flow = new FillFlowContainer().with({
      direction: FillDirection.Vertical, autoSizeAxes: Axes.Both, spacing: new Vector2(0, 5),
      children: [box(10, 20), box(10, 30), box(10, 5)],
    });
    root.add(flow);
    frame();
    expect(ys(flow)).toEqual([0, 25, 60]);
  });

  it('wraps rows in Full direction when exceeding width', () => {
    const { root, frame } = createHost();
    const flow = new FillFlowContainer().with({
      width: 100, autoSizeAxes: Axes.Y,
      children: [box(40, 10), box(40, 10), box(40, 15), box(40, 10)],
    });
    root.add(flow);
    frame();
    expect(flow.children.map(c => [c.x, c.y])).toEqual([[0, 0], [40, 0], [0, 10], [40, 10]]);
    expect(flow.drawHeight).toBe(25);
  });

  it('centres rows for centre-anchored children', () => {
    const { root, frame } = createHost();
    const flow = new FillFlowContainer().with({
      direction: FillDirection.Horizontal, width: 200, height: 50,
      children: [box(40, 10, { anchor: Anchor.TopCentre, origin: Anchor.TopCentre }), box(40, 10, { anchor: Anchor.TopCentre, origin: Anchor.TopCentre })],
    });
    root.add(flow);
    frame();
    expect(xs(flow)).toEqual([-20, 20]);
    expect(flow.children[0].screenSpaceDrawQuad.topLeft.x).toBeCloseTo(60);
    expect(flow.children[1].screenSpaceDrawQuad.topRight.x).toBeCloseTo(140);
  });

  it('flows right-to-left for right-anchored children', () => {
    const { root, frame } = createHost();
    const flow = new FillFlowContainer().with({
      direction: FillDirection.Horizontal, width: 200, height: 50, spacing: new Vector2(5, 0),
      children: [box(40, 10, { anchor: Anchor.TopRight, origin: Anchor.TopRight }), box(30, 10, { anchor: Anchor.TopRight, origin: Anchor.TopRight })],
    });
    root.add(flow);
    frame();
    expect(xs(flow)).toEqual([0, -45]);
  });

  it('relayouts on child size change, presence change and layout position change', () => {
    const { root, frame } = createHost();
    const a = box(50, 10), b = box(50, 10), c = box(50, 10);
    const flow = new FillFlowContainer().with({ direction: FillDirection.Horizontal, autoSizeAxes: Axes.Both, children: [a, b, c] });
    root.add(flow);
    frame();
    expect([a.x, b.x, c.x]).toEqual([0, 50, 100]);

    a.width = 80;
    frame();
    expect([a.x, b.x, c.x]).toEqual([0, 80, 130]);

    b.alpha = 0;
    frame();
    expect(c.x).toBe(80);

    b.alpha = 1;
    flow.setLayoutPosition(a, 1);
    frame();
    expect([b.x, c.x, a.x]).toEqual([0, 50, 100]);
    expect(flow.flowingChildren).toEqual([b, c, a]);
  });

  it('animates children to new positions with LayoutDuration', () => {
    const { root, frame } = createHost();
    const a = box(50, 10), b = box(50, 10);
    const flow = new FillFlowContainer().with({ direction: FillDirection.Horizontal, autoSizeAxes: Axes.Both, layoutDuration: 200, children: [a, b] });
    expect(flow.autoSizeDuration).toBe(100);
    root.add(flow);
    frame();
    frame(100);
    expect(b.x).toBeCloseTo(25);
    frame(100);
    expect(b.x).toBeCloseTo(50);
  });

  it('rejects relatively-sized children along an autosized flow axis', () => {
    const { root, frame } = createHost();
    const flow = new FillFlowContainer().with({
      direction: FillDirection.Horizontal, autoSizeAxes: Axes.Both,
      children: [new Box().with({ relativeSizeAxes: Axes.X, height: 10 })],
    });
    root.add(flow);
    expect(() => frame()).toThrow(/relative size axis/);
  });
});
