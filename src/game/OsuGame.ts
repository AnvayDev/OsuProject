// Ported from osu.Game/OsuGame.cs (the screen layering and screen change handling)
// Not ported yet: the loader/intro/main menu, toolbar, overlays, notifications, logo, footer, cursor, OSD, idle tracking and global
// key bindings. They will be added to the containers below as they are ported. The first screen is supplied by createLoader().

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import type { WorkingBeatmap } from './beatmaps/WorkingBeatmap';
import { Container } from '@fw/graphics/containers/Container';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import type { IScreen } from '@fw/screens/IScreen';
import { ScalingMode } from './configuration/ScalingMode';
import { ScalingContainer } from './graphics/containers/ScalingContainer';
import { OsuGameBase } from './OsuGameBase';
import { OverlayActivation } from './overlays/OverlayActivation';
import { OsuScreen } from './screens/OsuScreen';
import { OsuScreenStack } from './screens/OsuScreenStack';
import { OsuLogo } from './screens/menu/OsuLogo';
import { GameIdleTracker } from './input/GameIdleTracker';
import { IdleTracker } from './input/IdleTracker';

/** The full osu! experience. Builds on top of OsuGameBase to add menus and binding logic for the screen stack. */
export class OsuGame extends OsuGameBase {
  protected screenStack!: OsuScreenStack;

  /** The container the screen stack (and the screen-scaled overlays) live in. */
  protected screenContainer!: ScalingContainer;

  protected screenOffsetContainer!: Container;

  private overlayOffsetContainer!: Container;

  /** C#'s overlayContent (the framework Game already has an overlayContent: its framework-level overlays). */
  private gameOverlayContent!: Container;

  private leftFloatingOverlayContent!: Container;

  private rightFloatingOverlayContent!: Container;

  private topMostOverlayContent!: Container;

  private idleTracker!: IdleTracker;

  private footerBasedOverlayContent!: Container;

  private logoContainer!: Container;

  private osuLogo!: OsuLogo;

  /** Whether overlays should be able to be opened game-wide. Value is sourced from the current active screen. */
  readonly overlayActivationMode = new Bindable<OverlayActivation>(OverlayActivation.All);

  readonly scalingContainerTargetDrawSize = new Vector2(1024, 768);

  protected override createScalingContainer(): Container {
    return new ScalingContainer(ScalingMode.Everything);
  }

  /** The first screen pushed to the screen stack (C#'s Loader, which leads to the intro and the main menu). */
  protected createLoader(): OsuScreen | null {
    return null;
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = super.createChildDependencies(parent);

    // [Cached(typeof(OsuGame))]
    this.osuDependencies.cacheAs(OsuGame, this);

    return dependencies;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    // (SeasonalUIConfig.ENABLED is false, so the logo is never OsuLogoChristmas.)
    this.osuDependencies.cacheAs(OsuLogo, this.osuLogo = new OsuLogo().with({ alpha: 0 }));
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.beatmap.bindValueChanged(b => this.beatmapChanged(b), true);

    // (The session idle tracker, which resets SessionStatics after 5 minutes of inactivity, is not ported yet.)
    this.osuDependencies.cacheAs(IdleTracker, this.idleTracker = new GameIdleTracker(6000));

    this.addRange([
      this.screenOffsetContainer = new Container().with({
        relativeSizeAxes: Axes.Both,
        children: [
          this.screenContainer = new ScalingContainer(ScalingMode.ExcludeOverlays).with({
            relativeSizeAxes: Axes.Both,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            children: [
              this.screenStack = new OsuScreenStack().with({ relativeSizeAxes: Axes.Both }),
              this.logoContainer = new Container().with({ relativeSizeAxes: Axes.Both }),
              this.footerBasedOverlayContent = new Container().with({
                depth: -1,
                relativeSizeAxes: Axes.Both,
              }),
            ],
          }),
        ],
      }),
      this.overlayOffsetContainer = new Container().with({
        relativeSizeAxes: Axes.Both,
        children: [
          this.gameOverlayContent = new Container().with({ relativeSizeAxes: Axes.Both }),
          this.leftFloatingOverlayContent = new Container().with({ relativeSizeAxes: Axes.Both }),
          this.rightFloatingOverlayContent = new Container().with({ relativeSizeAxes: Axes.Both }),
        ],
      }),
      this.topMostOverlayContent = new Container().with({ relativeSizeAxes: Axes.Both }),
      this.idleTracker,
    ]);

    this.screenStack.screenPushed.add(([lastScreen, newScreen]) => this.screenPushed(lastScreen, newScreen));
    this.screenStack.screenExited.add(([lastScreen, newScreen]) => this.screenExited(lastScreen, newScreen));

    // loadComponentSingleFile(osuLogo, ...)
    void this.loadComponentAsync(this.osuLogo, () => {
      this.osuLogo.setupDefaultContainer(this.logoContainer);

      // Loader has to be created after the logo has finished loading as Loader performs logo transformations on entering.
      const loader = this.createLoader();

      if (loader !== null)
        this.screenStack.push(loader.with({ relativeSizeAxes: Axes.Both }));
    });
  }

  // #region Beatmap progression

  private beatmapChanged(beatmap: ValueChangedEvent<WorkingBeatmap>): void {
    beatmap.oldValue?.cancelAsyncLoad();
    beatmap.newValue?.beginAsyncLoad();
    // (updateWindowTitle: there is no host window title to update.)
  }

  // #endregion

  protected screenChanged(current: OsuScreen | null, newScreen: OsuScreen | null): void {
    if (current !== null)
      this.overlayActivationMode.unbindFrom(current.overlayActivationMode);

    // Bind to new screen.
    if (newScreen !== null)
      this.overlayActivationMode.bindTo(newScreen.overlayActivationMode);
  }

  private screenPushed(lastScreen: IScreen | null, newScreen: IScreen): void {
    this.screenChanged(lastScreen as OsuScreen | null, newScreen as OsuScreen);
  }

  private screenExited(lastScreen: IScreen, newScreen: IScreen | null): void {
    this.screenChanged(lastScreen as OsuScreen, newScreen as OsuScreen | null);

    if (newScreen === null)
      this.exit();
  }
}
