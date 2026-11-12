// Ported from osu.Framework.Tests/Graphics/LifetimeEntryManagerTest.cs

import { beforeEach, describe, expect, it } from 'vitest';
import { LifetimeBoundaryCrossingDirection as Direction, LifetimeBoundaryKind as Kind, LifetimeEntry, LifetimeEntryState } from '@fw/graphics/performance/LifetimeEntry';
import { LifetimeEntryManager } from '@fw/graphics/performance/LifetimeEntryManager';

class TestLifetimeEntryManager extends LifetimeEntryManager {
  readonly entries: LifetimeEntry[] = [];
  readonly crossings = new Map<LifetimeEntry, [Kind, Direction][]>();

  constructor() {
    super();

    this.entryCrossedBoundary.add(([entry, kind, direction]) => {
      if (!this.crossings.has(entry))
        this.crossings.set(entry, []);

      this.crossings.get(entry)!.push([kind, direction]);
    });
  }

  override addEntry(entry: LifetimeEntry): void {
    this.entries.push(entry);
    super.addEntry(entry);
  }

  override removeEntry(entry: LifetimeEntry): boolean {
    if (super.removeEntry(entry)) {
      this.entries.splice(this.entries.indexOf(entry), 1);
      return true;
    }

    return false;
  }

  /** (C#'s `new bool Update(double time)`: the single-time overload clears the recorded crossings.) */
  updateAt(time: number): boolean {
    this.crossings.clear();
    return this.update(time);
  }
}

const entry = (lifetimeStart: number, lifetimeEnd: number): LifetimeEntry => {
  const e = new LifetimeEntry();
  e.lifetimeStart = lifetimeStart;
  e.lifetimeEnd = lifetimeEnd;
  return e;
};

/** A deterministic generator standing in for C#'s seeded Random. */
function mulberry32(seed: number): (max: number) => number {
  return max => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * max);
  };
}

describe('LifetimeEntryManager', () => {
  let manager: TestLifetimeEntryManager;

  beforeEach(() => {
    manager = new TestLifetimeEntryManager();
  });

  function checkAlivenessAt(startTime: number, endTime = startTime): void {
    manager.update(startTime, endTime);

    manager.entries.forEach((e, i) => {
      const isAlive = e.state === LifetimeEntryState.Current;
      const shouldBeAlive = endTime >= e.lifetimeStart && startTime < e.lifetimeEnd;

      expect(isAlive, `Aliveness is invalid for entry ${i}`).toBe(shouldBeAlive);
    });
  }

  function checkCountAliveAt(startTime: number, endTimeOrCount: number, expectedCount?: number): void {
    const endTime = expectedCount === undefined ? startTime : endTimeOrCount;
    const count = expectedCount ?? endTimeOrCount;

    checkAlivenessAt(startTime, endTime);
    expect(manager.entries.filter(e => e.state === LifetimeEntryState.Current).length).toBe(count);
  }

  const checkNoCrossing = (e: LifetimeEntry) => expect(manager.crossings.has(e)).toBe(false);
  const checkCrossing = (e: LifetimeEntry, index: number, kind: Kind, direction: Direction) => expect(manager.crossings.get(e)![index]).toEqual([kind, direction]);

  it('tracks which entries are alive', () => {
    manager.addEntry(entry(-1, 1));
    manager.addEntry(entry(0, 1));
    manager.addEntry(entry(0, 2));
    manager.addEntry(entry(1, 2));
    manager.addEntry(entry(2, 2));
    manager.addEntry(entry(2, 3));

    checkCountAliveAt(0, 3);
    checkCountAliveAt(1, 2);
    checkCountAliveAt(2, 1);
    checkCountAliveAt(0, 3);
    checkCountAliveAt(3, 0);
  });

  it('removes and re-adds an entry', () => {
    const e = entry(0, 1);

    manager.addEntry(e);
    checkCountAliveAt(0, 1);

    manager.removeEntry(e);
    checkCountAliveAt(0, 0);

    manager.addEntry(e);
    checkCountAliveAt(0, 1);
  });

  it('follows lifetime changes', () => {
    manager.addEntry(entry(-1, 0));
    manager.addEntry(entry(0, 1));
    manager.addEntry(entry(0, 1));
    manager.addEntry(entry(1, 2));

    checkCountAliveAt(0, 2);

    manager.entries[0].lifetimeEnd = 1;
    manager.entries[1].lifetimeStart = 1;
    manager.entries[2].lifetimeEnd = 0;
    manager.entries[3].lifetimeStart = 0;

    checkCountAliveAt(0, 2);

    for (const e of manager.entries) {
      e.lifetimeEnd += 1;
      e.lifetimeStart += 1;
    }

    checkCountAliveAt(0, 1);

    for (const e of manager.entries) {
      e.lifetimeStart -= 1;
      e.lifetimeEnd -= 1;
    }

    checkCountAliveAt(0, 2);
  });

  it('reports boundary crossings in order', () => {
    manager.addEntry(entry(-1, 0));
    manager.addEntry(entry(0, 1));
    manager.addEntry(entry(1, 2));

    // No crossings for the first update.
    manager.updateAt(0);
    checkNoCrossing(manager.entries[0]);
    checkNoCrossing(manager.entries[1]);
    checkNoCrossing(manager.entries[2]);

    manager.updateAt(2);
    checkNoCrossing(manager.entries[0]);
    checkCrossing(manager.entries[1], 0, Kind.End, Direction.Forward);
    checkCrossing(manager.entries[2], 0, Kind.Start, Direction.Forward);
    checkCrossing(manager.entries[2], 1, Kind.End, Direction.Forward);

    manager.updateAt(1);
    checkNoCrossing(manager.entries[0]);
    checkNoCrossing(manager.entries[1]);
    checkCrossing(manager.entries[2], 0, Kind.End, Direction.Backward);

    manager.updateAt(-1);
    checkCrossing(manager.entries[0], 0, Kind.End, Direction.Backward);
    checkCrossing(manager.entries[1], 0, Kind.End, Direction.Backward);
    checkCrossing(manager.entries[1], 1, Kind.Start, Direction.Backward);
    checkCrossing(manager.entries[2], 0, Kind.Start, Direction.Backward);
  });

  it('applies lifetime changes made in a callback', () => {
    let updateTime = 0;

    manager.addEntry(entry(0, 1));
    manager.entryCrossedBoundary.add(([e, kind, direction]) => {
      if (kind === Kind.End && direction === Direction.Forward)
        e.lifetimeEnd = 2;
      else if (kind === Kind.Start && direction === Direction.Backward)
        e.lifetimeEnd = 1;
      else if (kind === Kind.Start && direction === Direction.Forward)
        e.lifetimeStart = e.lifetimeStart === 0 ? 1 : 0;

      // Lifetime changes are applied in the _next_ update.
      manager.updateAt(updateTime);
    });

    manager.updateAt(updateTime = 0);

    checkCountAliveAt(updateTime = 1, 1);
    checkCountAliveAt(updateTime = -1, 0);
    checkCountAliveAt(updateTime = 0, 0);
    checkCountAliveAt(updateTime = 1, 1);
  });

  it('updates with a time range', () => {
    manager.addEntry(entry(-1, 1));
    manager.addEntry(entry(0, 1));
    manager.addEntry(entry(0, 2));
    manager.addEntry(entry(1, 2));
    manager.addEntry(entry(2, 2));
    manager.addEntry(entry(2, 3));

    checkCountAliveAt(-3, -2, 0);
    checkCountAliveAt(-3, -1, 1);
    checkCountAliveAt(-2, 4, 6);
    checkCountAliveAt(-1, 4, 6);
    checkCountAliveAt(0, 4, 6);
    checkCountAliveAt(1, 4, 4);
    checkCountAliveAt(2, 4, 1);
    checkCountAliveAt(3, 4, 0);
    checkCountAliveAt(4, 4, 0);
  });

  it('removes a future entry after its lifetime changed', () => {
    manager.addEntry(entry(1, 2));
    checkCountAliveAt(0, 0);

    manager.entries[0].lifetimeEnd = 3;
    manager.removeEntry(manager.entries[0]);

    checkCountAliveAt(1, 0);
  });

  it('removes a past entry after its lifetime changed', () => {
    manager.addEntry(entry(-2, -1));
    checkCountAliveAt(0, 0);

    manager.entries[0].lifetimeStart = -3;
    manager.removeEntry(manager.entries[0]);

    checkCountAliveAt(-2, 0);
  });

  it('stays consistent under random adds, removals, lifetime and time changes', () => {
    const next = mulberry32(2222);

    let currentTime = 0;

    const checkAll = () => checkAlivenessAt(currentTime);

    const randomLifetime = (): [number, number] => {
      let l = next(5);
      let r = next(5);
      if (l > r)
        [l, r] = [r, l];
      return [l, r + 1];
    };

    const addEntry = () => {
      manager.addEntry(entry(...randomLifetime()));
      checkAll();
    };

    const removeEntry = () => {
      manager.removeEntry(manager.entries[next(manager.entries.length)]);
      checkAll();
    };

    const changeLifetime = () => {
      const e = manager.entries[next(manager.entries.length)];
      const [l, r] = randomLifetime();
      e.lifetimeStart = l;
      e.lifetimeEnd = r;
      checkAll();
    };

    const changeTime = () => {
      currentTime = next(6);
      checkAll();
    };

    addEntry();
    manager.entryCrossedBoundary.add(() => changeLifetime());
    manager.update(0);

    let count = 1;

    for (let i = 0; i < 1000; i++) {
      switch (next(3)) {
        case 0:
          if (count < 20) {
            addEntry();
            count += 1;
          } else {
            removeEntry();
            count -= 1;
          }

          break;

        case 1:
          changeLifetime();
          break;

        case 2:
          changeTime();
          break;
      }
    }
  });
});
