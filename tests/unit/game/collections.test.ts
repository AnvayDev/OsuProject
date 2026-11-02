import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BeatmapCollection } from '@game/collections/BeatmapCollection';
import { type ChangeSet, RealmAccess } from '@game/database/RealmAccess';

let dbCounter = 0;

describe('BeatmapCollection storage (RealmAccess)', () => {
  it('adds, edits and removes collections, notifying a sorted query like realm', async () => {
    const realm = await RealmAccess.open(`collections-test-${dbCounter++}`);
    const notifications: [string[], ChangeSet | null][] = [];

    realm.registerForCollectionNotifications(all => [...all].sort((a, b) => a.name.localeCompare(b.name)), (sender, changes) => {
      notifications.push([sender.map(c => c.name), changes]);
    });

    await realm.writeCollections(w => {
      w.add(new BeatmapCollection('b'));
      w.add(new BeatmapCollection('a'));
    });

    const [a, b] = ['a', 'b'].map(n => realm.allCollections().find(c => c.name === n)!);

    await realm.toLive(b).performWrite(c => c.beatmapMD5Hashes.push('hash1'));
    expect(realm.toLive(b).performRead(c => c.beatmapMD5Hashes)).toEqual(['hash1']);

    await realm.writeCollections(w => w.remove(a));

    expect(notifications).toEqual([
      [[], null],
      [['a', 'b'], { deletedIndices: [], insertedIndices: [0, 1], newModifiedIndices: [] }],
      [['a', 'b'], { deletedIndices: [], insertedIndices: [], newModifiedIndices: [1] }],
      [['b'], { deletedIndices: [0], insertedIndices: [], newModifiedIndices: [] }],
    ]);

    // committed objects are never mutated: the earlier instance keeps its old state.
    expect(b.beatmapMD5Hashes).toEqual([]);
  });

  it('reports a rename that moves a collection in a sorted query as a deletion and an insertion, like realm', async () => {
    const realm = await RealmAccess.open(`collections-test-${dbCounter++}`);
    await realm.writeCollections(w => ['a', 'b', 'c'].forEach(n => w.add(new BeatmapCollection(n))));

    const notifications: ChangeSet[] = [];
    realm.registerForCollectionNotifications(all => [...all].sort((a, b) => a.name.localeCompare(b.name)), (_, changes) => {
      if (changes !== null) notifications.push(changes);
    });

    const a = realm.allCollections().find(c => c.name === 'a')!;
    await realm.toLive(a).performWrite(c => c.name = 'd');

    expect(notifications).toEqual([{ deletedIndices: [0], insertedIndices: [2], newModifiedIndices: [] }]);
  });

  it('keeps collections across sessions', async () => {
    const name = `collections-test-${dbCounter++}`;
    const realm = await RealmAccess.open(name);
    await realm.writeCollections(w => w.add(new BeatmapCollection('kept', ['x', 'y'])));
    realm.db.close();

    const reopened = await RealmAccess.open(name);
    expect(reopened.allCollections().map(c => [c.name, c.beatmapMD5Hashes])).toEqual([['kept', ['x', 'y']]]);
  });
});
