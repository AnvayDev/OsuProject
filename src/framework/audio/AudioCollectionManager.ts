// Ported from osu.Framework/Audio/AudioCollectionManager.cs (device updates are not applicable in the browser).

import { AdjustableAudioComponent, type AudioComponent, isAdjustableAudioComponent } from './AudioComponent';

/** A collection of audio components which need central property control. */
export class AudioCollectionManager<T extends AudioComponent> extends AdjustableAudioComponent {
  /** @internal */
  readonly items: T[] = [];

  addItem(item: T): void {
    void this.enqueueAction(() => {
      if (this.items.includes(item)) return;

      if (isAdjustableAudioComponent(item))
        item.bindAdjustments(this);

      this.items.push(item);
      this.itemAdded(item);
    });
  }

  removeItem(item: T): void {
    void this.enqueueAction(() => {
      const i = this.items.indexOf(item);
      if (i < 0) return;

      if (isAdjustableAudioComponent(item))
        item.unbindAdjustments(this);

      this.items.splice(i, 1);
      this.itemRemoved(item);
    });
  }

  protected override updateChildren(): void {
    super.updateChildren();

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];

      if (!item.isAlive) {
        this.items.splice(i--, 1);
        this.itemRemoved(item);
        continue;
      }

      item.update();
    }
  }

  protected itemAdded(_item: T): void {
  }

  protected itemRemoved(_item: T): void {
  }

  protected override onDispose(disposing: boolean): void {
    // make the items queue their disposal, so they get disposed when UpdateChildren updates them.
    for (const i of this.items)
      i.dispose();

    super.onDispose(disposing);
  }
}
