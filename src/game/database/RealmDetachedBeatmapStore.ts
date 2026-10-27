// Ported from osu.Game/Database/RealmDetachedBeatmapStore.cs
// RealmAccess delivers the initial results synchronously and never mutates a committed set (see RealmAccess.ts), so the initial load needs
// no background task or wait, and "detaching" a set is the set itself.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableList } from '@fw/bindables/BindableList';
import type { BeatmapSetInfo } from '../beatmaps/BeatmapSetInfo';
import { BeatmapStore } from './BeatmapStore';
import { type ChangeSet, RealmAccess } from './RealmAccess';

enum OperationType {
  Insert,
  Update,
  MoveAndReplace,
  Remove,
}

interface OperationArgs {
  readonly type: OperationType;
  readonly beatmapSet?: BeatmapSetInfo;
  readonly index: number;
  readonly newIndex?: number;
}

export class RealmDetachedBeatmapStore extends BeatmapStore {
  private loaded = false;

  private readonly detachedBeatmapSets = new BindableList<BeatmapSetInfo>();

  private realmSubscription: { dispose(): void } | null = null;

  private readonly pendingOperations: OperationArgs[] = [];

  override getBeatmapSets(): BindableList<BeatmapSetInfo> {
    return this.detachedBeatmapSets.getBoundCopy();
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const realm = dependencies.resolve(RealmAccess);
    this.realmSubscription = realm.registerForNotifications(all => all.filter(s => !s.deletePending && !s.isProtected), (sender, changes) => this.beatmapSetsChanged(sender, changes));

    return r;
  }

  private beatmapSetsChanged(sender: readonly BeatmapSetInfo[], changes: ChangeSet | null): void {
    if (changes === null) {
      this.detachedBeatmapSets.clear();
      this.detachedBeatmapSets.addRange(sender);

      this.loaded = true;
      return;
    }

    if (changes.insertedIndices.length === 1 && changes.deletedIndices.length === 1) {
      const deletedSet = this.detachedBeatmapSets.get(changes.deletedIndices[0]);
      const insertedSet = sender[changes.insertedIndices[0]];

      // this handles beatmap updates using a heuristic that a beatmap update will preserve the online ID.
      // it relies on the fact that updates are performed by removing the old set and adding a new one, in a single transaction.
      // instead of removing the old set and adding a new one to the collection too, which would trigger consumers' logic related to set removals,
      // move the deleted set to the index occupied by the new one and then replace it in-place.
      // due to this, the operation can be presented to consumer in a manner that permits them to actually handle this as a replace operation
      // and not trigger any set removal logic that may result in selections changing or similar undesirable side effects.
      if (deletedSet.onlineID === insertedSet.onlineID) {
        this.pendingOperations.push({
          type: OperationType.MoveAndReplace,
          beatmapSet: insertedSet,
          index: changes.deletedIndices[0],
          newIndex: changes.insertedIndices[0],
        });

        return;
      }
    }

    for (const i of [...changes.deletedIndices].sort((a, b) => b - a)) {
      this.pendingOperations.push({
        type: OperationType.Remove,
        index: i,
      });
    }

    for (const i of changes.insertedIndices) {
      this.pendingOperations.push({
        type: OperationType.Insert,
        beatmapSet: sender[i],
        index: i,
      });
    }

    for (const i of changes.newModifiedIndices) {
      this.pendingOperations.push({
        type: OperationType.Update,
        beatmapSet: sender[i],
        index: i,
      });
    }
  }

  protected override update(): void {
    super.update();

    // We can't start processing operations until we have finished detaching the initial list.
    if (!this.loaded)
      return;

    // If this ever leads to performance issues, we could dequeue a limited number of operations per update frame.
    let op: OperationArgs | undefined;

    while ((op = this.pendingOperations.shift()) !== undefined) {
      switch (op.type) {
        case OperationType.Insert:
          this.detachedBeatmapSets.insert(op.index, op.beatmapSet!);
          break;

        case OperationType.Update:
          this.detachedBeatmapSets.replaceRange(op.index, 1, [op.beatmapSet!]);
          break;

        case OperationType.MoveAndReplace:
          this.detachedBeatmapSets.move(op.index, op.newIndex!);
          this.detachedBeatmapSets.replaceRange(op.newIndex!, 1, [op.beatmapSet!]);
          break;

        case OperationType.Remove:
          this.detachedBeatmapSets.removeAt(op.index);
          break;
      }
    }
  }

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);

    this.realmSubscription?.dispose();
  }
}
