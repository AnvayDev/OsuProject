import { describe, expect, it } from 'vitest';
import { createHost } from './testHost';
import { Box } from '@fw/graphics/shapes/Box';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { Drawable } from '@fw/graphics/Drawable';

const fill = () => new Box().with({ relativeSizeAxes: Axes.Both });
const box = (w: number, h: number) => new Box().with({ size: new Vector2(w, h) });
const rect = (d: Drawable) => { const q = d.screenSpaceDrawQuad; return [q.topLeft.x, q.topLeft.y, q.width, q.height].map(v => Math.round(v * 1000) / 1000); };

describe('GridContainer', () => {
  it('distributes remaining space evenly', () => {
    const { root, frame } = createHost();
    const cells = [[fill(), fill()], [fill(), fill()]];
    root.add(new GridContainer().with({ size: new Vector2(200, 100), content: cells }));
    frame();
    expect(rect(cells[0][0])).toEqual([0, 0, 100, 50]);
    expect(rect(cells[0][1])).toEqual([100, 0, 100, 50]);
    expect(rect(cells[1][1])).toEqual([100, 50, 100, 50]);
  });

  it('mixes absolute, relative and distributed dimensions inside padding', () => {
    const { root, frame } = createHost();
    const cells = [[fill(), fill(), fill()]];
    root.add(new GridContainer().with({
      size: new Vector2(420, 100), padding: MarginPadding.of({ horizontal: 10 }),
      columnDimensions: [new Dimension(GridSizeMode.Absolute, 50), new Dimension(), new Dimension(GridSizeMode.Relative, 0.25)],
      content: cells,
    }));
    frame();
    expect(cells[0].map(c => rect(c)[2])).toEqual([50, 250, 100]);
    expect(cells[0].map(c => rect(c)[0])).toEqual([10, 60, 310]);
  });

  it('autosizes columns/rows to present, non-relative content and tracks content size changes', () => {
    const { root, frame } = createHost();
    const a = box(30, 10), b = box(70, 40), c = fill(), d = fill();
    const grid = new GridContainer().with({
      width: 300, autoSizeAxes: Axes.Y,
      columnDimensions: [new Dimension(GridSizeMode.AutoSize)],
      rowDimensions: [new Dimension(GridSizeMode.AutoSize), new Dimension(GridSizeMode.AutoSize)],
      content: [[a, c], [b, d]],
    });
    root.add(grid);
    frame();
    expect(rect(c)).toEqual([70, 0, 230, 10]);
    expect(rect(d)).toEqual([70, 10, 230, 40]);
    expect(grid.drawHeight).toBe(50);

    b.width = 90;
    frame();
    expect(rect(c)[0]).toBe(90);

    b.alpha = 0;
    frame();
    expect(rect(c)[0]).toBe(30);
    expect(grid.drawHeight).toBe(10);
  });

  it('caps distributed cells at their max size and redistributes the excess', () => {
    const { root, frame } = createHost();
    const cells = [[fill(), fill()]];
    root.add(new GridContainer().with({
      size: new Vector2(300, 10),
      columnDimensions: [new Dimension(GridSizeMode.Distributed, 0, 0, 50), new Dimension()],
      content: cells,
    }));
    frame();
    expect(cells[0].map(c => rect(c)[2])).toEqual([50, 250]);
  });

  it('allows blank rows, non-square rows and null cells', () => {
    const { root, frame } = createHost();
    const a = fill(), b = fill();
    root.add(new GridContainer().with({ size: new Vector2(300, 300), content: [[a, null, null], null, [b]] }));
    frame();
    expect(rect(a)).toEqual([0, 0, 100, 100]);
    expect(rect(b)).toEqual([0, 200, 100, 100]);
  });

  it('re-lays out when a content element is replaced', () => {
    const { root, frame } = createHost();
    const a = fill(), b = fill();
    const grid = new GridContainer().with({ size: new Vector2(200, 100), content: [[a, null]] });
    root.add(grid);
    frame();
    grid.content!.get(0)!.set(1, b);
    frame();
    expect(b.parent).not.toBeNull();
    expect(rect(b)).toEqual([100, 0, 100, 100]);
    expect(rect(a)).toEqual([0, 0, 100, 100]);
  });
});
