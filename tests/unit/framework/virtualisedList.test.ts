// VirtualisedListContainer (VirtualisedListContainer.cs): rows are laid out at index * rowHeight, and only the rows within the scroll
// viewport get a pooled drawable.
import { describe, expect, it } from 'vitest';
import { BindableWithCurrent, type Bindable } from '@fw/bindables/Bindable';
import { BasicScrollContainer } from '@fw/graphics/containers/BasicScrollContainer';
import { VirtualisedListContainer } from '@fw/graphics/containers/VirtualisedListContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import type { ScrollContainer } from '@fw/graphics/containers/ScrollContainer';
import { PoolableDrawable } from '@fw/graphics/pooling/PoolableDrawable';
import { Vector2 } from '@fw/layout/Vector2';
import { createHost } from './testHost';

class Row extends PoolableDrawable {
  private readonly _current = new BindableWithCurrent<string>();

  get current(): Bindable<string> {
    return this._current.current;
  }

  set current(value: Bindable<string>) {
    this._current.current = value;
  }
}

class List extends VirtualisedListContainer<string, Row> {
  constructor() {
    super(Row, 20, 5);
  }

  protected override createScrollContainer(): ScrollContainer<Drawable> {
    return new BasicScrollContainer();
  }

  get rows() {
    return this.items.children;
  }
}

function setup(count: number) {
  const { root, frame } = createHost();
  const list = new List().with({ size: new Vector2(200, 100) });
  root.add(list);
  frame();

  list.rowData.addRange(Array.from({ length: count }, (_, i) => `row ${i}`));
  frame();

  const loaded = () => list.rows.filter(r => r.visible).map(r => (r.internalChildren[0] as Row).current.value);
  return { list, frame, loaded };
}

describe('VirtualisedListContainer', () => {
  it('only loads the rows within the viewport', () => {
    const { list, loaded } = setup(50);

    expect(list.rows.map(r => r.y).slice(0, 3)).toEqual([0, 20, 40]);
    // visible range: rows [0, 100 / 20 + 1) = 0..5, of which rows whose bottom is within 6 * 20.
    expect(loaded()).toEqual(['row 0', 'row 1', 'row 2', 'row 3', 'row 4', 'row 5']);
  });

  it('moves the following rows up when a row is removed', () => {
    const { list, frame } = setup(10);

    list.rowData.removeAt(1);
    frame();

    expect(list.rows.length).toBe(9);
    expect(list.rows.map(r => [r.row, r.y]).slice(0, 3)).toEqual([['row 0', 0], ['row 2', 20], ['row 3', 40]]);
  });

  it('moves the following rows down when a row is inserted', () => {
    const { list, frame } = setup(3);

    list.rowData.insert(1, 'new');
    frame();

    expect(list.rows.map(r => [r.row, r.y])).toEqual([['row 0', 0], ['new', 20], ['row 1', 40], ['row 2', 60]]);
  });
});
