// Ported from osu.Framework/Graphics/Containers/DelayedLoadUnloadWrapper.cs (without the GlobalStatistic counter).

import { Invalidation } from '../../layout/Enums';
import { LayoutValueOf } from '../../layout/Layout';
import type { IFrameBasedClock } from '../../timing/IClock';
import type { ScheduledDelegate } from '../../timing/Scheduler';
import { Game } from '../../Game';
import type { Drawable } from '../Drawable';
import { DelayedLoadWrapper } from './DelayedLoadWrapper';

export class DelayedLoadUnloadWrapper extends DelayedLoadWrapper {
  private readonly timeBeforeUnload: number;

  constructor(createContentFunction: () => Drawable, timeBeforeLoad = 500, timeBeforeUnload = 1000) {
    super(createContentFunction, timeBeforeLoad);

    this.timeBeforeUnload = timeBeforeUnload;

    this.addLayout(this.unloadClockBacking);
  }

  private timeHidden = 0;

  private unloadSchedule: ScheduledDelegate | null = null;

  protected get shouldUnloadContent(): boolean {
    return this.timeBeforeUnload === 0 || this.timeHidden > this.timeBeforeUnload;
  }

  private scheduledUnloadCheckRegistration: ScheduledDelegate | null = null;

  protected override endDelayedLoad(content: Drawable): void {
    super.endDelayedLoad(content);

    // Scheduled for another frame since Update() may not have run yet and thus OptimisingContainer may not be up-to-date
    this.scheduledUnloadCheckRegistration = this.game.schedule(() => {
      if (this.isDisposed)
        return;

      this.unloadSchedule = this.game.scheduler.addDelayed(() => this.checkForUnload(), 0, true);
    });
  }

  protected override cancelTasks(): void {
    super.cancelTasks();

    if (this.unloadSchedule !== null) {
      this.unloadSchedule.cancel();
      this.unloadSchedule = null;
    }

    this.scheduledUnloadCheckRegistration?.cancel();
    this.scheduledUnloadCheckRegistration = null;
  }

  private readonly unloadClockBacking = new LayoutValueOf<IFrameBasedClock>(Invalidation.Parent);

  private get unloadClock(): IFrameBasedClock {
    if (!this.unloadClockBacking.isValid)
      this.unloadClockBacking.value = this.findClosestParent(Game) === null ? this.game.clock! : this.clock!;

    return this.unloadClockBacking.value;
  }

  private checkForUnload(): void {
    if (this.isDisposed)
      return;

    // This code can be expensive, so only run if we haven't yet loaded.
    if (this.isIntersecting)
      this.timeHidden = 0;
    else
      this.timeHidden += this.unloadClock.elapsedFrameTime;

    // Don't unload if we don't need to.
    if (!this.shouldUnloadContent)
      return;

    // We need to dispose the content, taking into account what we know at this point in time:
    // 1: The wrapper has not been disposed. Consequently, neither has the content.
    // 2: The content has finished loading.
    // 3: The content may not have been added to the hierarchy (e.g. if this wrapper is hidden). This is dependent upon the value of DelayedLoadCompleted.
    if (this.delayedLoadCompleted)
      this.clearInternal(); // Content added, remove AND dispose.
    else
      this.disposeChildAsync(this.content!); // Content not added, only need to dispose.

    this.content = null;
    this.timeHidden = 0;

    // This has two important roles:
    // 1. Stopping this delegate from executing multiple times.
    // 2. If DelayedLoadCompleted = false (content not yet added to hierarchy), prevents the now disposed content from being added (e.g. if this wrapper becomes visible again).
    this.cancelTasks();

    // And finally, allow another load to take place.
    this.delayedLoadTriggered = this.delayedLoadCompleted = false;
  }
}
