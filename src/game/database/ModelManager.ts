// Ported from osu.Game/Database/ModelManager.cs (the delete/undelete half; file editing is editor-only). TModel = BeatmapSetInfo, the only
// realm model this port stores.

import type { BeatmapSetInfo } from '../beatmaps/BeatmapSetInfo';
import type { Notification } from '../overlays/notifications/Notification';
import { ProgressCompletionNotification } from '../overlays/notifications/ProgressCompletionNotification';
import { ProgressNotification, ProgressNotificationState } from '../overlays/notifications/ProgressNotification';
import type { RealmAccess } from './RealmAccess';

export class ModelManager {
  constructor(protected readonly realm: RealmAccess) {}

  /** Delete multiple items. This will post notifications tracking progress. */
  async deleteItems(items: readonly BeatmapSetInfo[], silent = false): Promise<void> {
    if (items.length === 0) {
      if (!silent)
        this.postNotification?.(Object.assign(new ProgressCompletionNotification(), { text: `No ${this.humanisedModelName}s found to delete!` }));
      return;
    }

    const notification = Object.assign(new ProgressNotification(), {
      progress: 0,
      text: `Preparing to delete all ${this.humanisedModelName}s...`,
      completionText: `Deleted all ${this.humanisedModelName}s!`,
      state: ProgressNotificationState.Active,
    });

    if (!silent)
      this.postNotification?.(notification);

    let i = 0;

    for (const b of items) {
      if (notification.state === ProgressNotificationState.Cancelled)
        // user requested abort
        return;

      notification.text = `Deleting ${this.humanisedModelName}s (${++i} of ${items.length})`;

      await this.delete(b);

      notification.progress = i / items.length;
    }

    notification.state = ProgressNotificationState.Completed;
  }

  /** Restore multiple items that were previously deleted. This will post notifications tracking progress. */
  async undeleteItems(items: readonly BeatmapSetInfo[], silent = false): Promise<void> {
    if (items.length === 0) {
      if (!silent)
        this.postNotification?.(Object.assign(new ProgressCompletionNotification(), { text: `No ${this.humanisedModelName}s found to restore!` }));
      return;
    }

    const notification = Object.assign(new ProgressNotification(), {
      completionText: 'Restored all deleted items!',
      progress: 0,
      state: ProgressNotificationState.Active,
    });

    if (!silent)
      this.postNotification?.(notification);

    let i = 0;

    for (const item of items) {
      if (notification.state === ProgressNotificationState.Cancelled)
        // user requested abort
        return;

      notification.text = `Restoring (${++i} of ${items.length})`;

      await this.undelete(item);

      notification.progress = i / items.length;
    }

    notification.state = ProgressNotificationState.Completed;
  }

  /** Delete an item from the manager. Is a no-op for already deleted items. Returns false if no operation was performed. */
  delete(item: BeatmapSetInfo): Promise<boolean> {
    return this.realm.write(realm => {
      const processableItem = realm.find(item.id);

      if (processableItem?.deletePending !== false)
        return false;

      realm.edit(processableItem).deletePending = true;
      return true;
    });
  }

  /** Restore an item that was previously deleted. Is a no-op if the item is not in a deleted state, or has its protected flag set. */
  async undelete(item: BeatmapSetInfo): Promise<void> {
    await this.realm.write(realm => {
      const processableItem = realm.find(item.id);

      if (processableItem?.deletePending !== true)
        return;

      realm.edit(processableItem).deletePending = false;
    });
  }

  postNotification: ((notification: Notification) => void) | null = null;

  get humanisedModelName(): string {
    return 'beatmapset';
  }
}
