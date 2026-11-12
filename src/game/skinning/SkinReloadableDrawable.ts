// Ported from osu.Game/Skinning/SkinReloadableDrawable.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Signal } from '@fw/bindables/Signal';
import { PoolableDrawable } from '@fw/graphics/pooling/PoolableDrawable';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { ISkinSource } from './ISkin';

/** A drawable which has a callback when the skin changes. */
export abstract class SkinReloadableDrawable extends PoolableDrawable {
  /** Invoked when the skin is changed. */
  private pendingSkinChange: ScheduledDelegate | null = null;

  readonly onSkinChanged = new Signal<void>();

  /** The current skin source. */
  protected currentSkin!: ISkinSource;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.currentSkin = dependencies.resolve(ISkinSource);
    this.currentSkin.sourceChanged.add(this.onChange);

    return r;
  }

  protected override loadAsyncComplete(): void {
    super.loadAsyncComplete();
    this.skinChangedInternal();
  }

  /** Force any pending SkinChanged calls to be performed immediately. When a skin change occurs, the handling is scheduled; in some cases a caller may want to immediately process it. */
  protected flushPendingSkinChanges(): void {
    if (this.pendingSkinChange === null)
      return;

    this.pendingSkinChange.runTask();
    this.pendingSkinChange = null;
  }

  /** Called when a change is made to the skin. */
  protected skinChanged(_skin: ISkinSource): void {
  }

  private readonly onChange = (): void => {
    // schedule required to avoid calls after disposed.
    // note that this has the side-effect of components only performing a skin change when they are alive.
    this.pendingSkinChange?.cancel();
    this.pendingSkinChange = this.scheduler.add(this.skinChangedInternal);
  };

  private readonly skinChangedInternal = (): void => {
    this.skinChanged(this.currentSkin);
    this.onSkinChanged.emit();

    this.pendingSkinChange = null;
  };

  protected override disposeInternal(isDisposing: boolean): void {
    super.disposeInternal(isDisposing);

    (this.currentSkin as ISkinSource | undefined)?.sourceChanged.remove(this.onChange);

    this.onSkinChanged.clear();
  }
}
