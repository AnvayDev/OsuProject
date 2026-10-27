import { describe, expect, it } from 'vitest';
import { BindableList, NotifyCollectionChangedAction, type NotifyCollectionChangedEvent } from '@fw/bindables/BindableList';

describe('BindableList', () => {
  it('propagates mutations between bound lists and raises .NET-shaped change events', () => {
    const a = new BindableList<number>([1, 2]);
    const b = new BindableList<number>();
    b.bindTo(a);
    expect([...b]).toEqual([1, 2]);

    const events: NotifyCollectionChangedEvent<number>[] = [];
    b.bindCollectionChanged((_, e) => events.push(e));

    a.add(3);
    a.insert(0, 0);
    a.remove(2);
    a.move(0, 2);
    a.set(0, 9);
    expect([...b]).toEqual([9, 3, 0]);
    expect(events.map(e => NotifyCollectionChangedAction[e.action])).toEqual(['Add', 'Add', 'Remove', 'Move', 'Replace']);
    expect(events[2]).toMatchObject({ oldItems: [2], oldStartingIndex: 2 });
    expect(events[3]).toMatchObject({ newStartingIndex: 2, oldStartingIndex: 0 });

    b.clear();
    expect(a.count).toBe(0);
    expect(events.at(-1)).toMatchObject({ action: NotifyCollectionChangedAction.Remove, oldItems: [9, 3, 0], oldStartingIndex: 0 });
  });

  it('disables mutation and binary-searches like List<T>.BinarySearch', () => {
    const list = new BindableList<number>([1, 3, 5]);
    const cmp = (x: number, y: number) => x - y;
    expect(list.binarySearch(3, cmp)).toBe(1);
    expect(list.binarySearch(4, cmp)).toBe(~2);
    expect(list.binarySearch(9, cmp)).toBe(~3);

    list.disabled = true;
    expect(() => list.add(1)).toThrow();
  });
});

describe('BindableList equality (List<T> / EqualityComparer<T>.Default)', () => {
  class Model {
    constructor(readonly id: number) {}

    equals(other: Model | null): boolean {
      return other !== null && other.id === this.id;
    }
  }

  it('finds, contains and removes items by equals(), returning the list\'s own instance', () => {
    const original = new Model(2);
    const list = new BindableList<Model>([new Model(1), original, new Model(3)]);
    const removed: Model[] = [];
    list.bindCollectionChanged((_, e) => removed.push(...(e.oldItems ?? [])));

    expect(list.indexOf(new Model(2))).toBe(1);
    expect(list.contains(new Model(3))).toBe(true);
    expect(list.indexOf(new Model(4))).toBe(-1);

    expect(list.remove(new Model(2))).toBe(true);
    expect(removed).toEqual([original]);
    expect(removed[0]).toBe(original);
  });

  it('keeps reference equality for items without equals()', () => {
    const a = { v: 1 };
    const list = new BindableList([a]);

    expect(list.indexOf({ v: 1 })).toBe(-1);
    expect(list.indexOf(a)).toBe(0);
  });
});
