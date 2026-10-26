// Ported from osu.Game/PerformFromMenuRunner.cs
// Valid screens are predicates (C# compares Types). Not ported yet: the dialog check (there is no dialog overlay, so no dialog blocks the
// action) and sub screen stacks (IHasSubScreenStack: no ported screen has one).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Component } from '@fw/graphics/Component';
import { type IScreen, ScreenExtensions } from '@fw/screens/IScreen';
import { ScheduledDelegate } from '@fw/timing/Scheduler';
import { OsuGame } from './OsuGame';

export class PerformFromMenuRunner extends Component {
  /**
   * MainMenu, registered by its module: importing it here would make OsuGame's imports reach song select, whose static members read
   * OsuGame's.
   */
  static mainMenuType: (abstract new (...args: never[]) => IScreen) | null = null;

  private readonly finalAction: (screen: IScreen) => void;
  private readonly validScreens: ((screen: IScreen) => boolean)[];
  private readonly getCurrentScreen: () => IScreen | null;

  private game: OsuGame | null = null;

  private readonly task: ScheduledDelegate;

  constructor(finalAction: (screen: IScreen) => void, validScreens: ((screen: IScreen) => boolean)[] | null, getCurrentScreen: () => IScreen | null) {
    super();

    this.finalAction = finalAction;
    this.validScreens = [...validScreens ?? [], s => PerformFromMenuRunner.mainMenuType !== null && s instanceof PerformFromMenuRunner.mainMenuType];
    this.getCurrentScreen = getCurrentScreen;

    this.scheduler.add(this.task = new ScheduledDelegate(() => this.checkCanComplete(), 0, 200));
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.game = dependencies.get(OsuGame);

    return r;
  }

  /** Cancel this runner from running. */
  cancel(): void {
    this.task.cancel();
    this.expire();
  }

  private checkCanComplete(): void {
    // find closest valid target
    const current = this.getCurrentScreen();

    if (current === null)
      return;

    this.game?.closeAllOverlays(false);

    this.findValidTarget(current);
  }

  private findValidTarget(current: IScreen | null): boolean {
    const initial = current;

    // check if we are already at a valid target screen.
    if (initial !== null && this.validScreens.some(t => t(initial))) {
      if (!initial.isLoaded)
        // wait until screen is loaded before invoking action.
        return true;

      this.finalAction(initial);
      this.cancel();
      return true;
    }

    while (current !== null) {
      const screen = current;

      if (this.validScreens.some(t => t(screen))) {
        ScreenExtensions.makeCurrent(screen);
        return true;
      }

      current = ScreenExtensions.getParentScreen(current);
    }

    return false;
  }
}
