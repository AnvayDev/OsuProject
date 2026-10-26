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
import { BackReceptor, type ScreenFooter } from './screens/footer/ScreenFooter';
import { ScreenStackFooter } from './screens/footer/ScreenStackFooter';
import { GameIdleTracker } from './input/GameIdleTracker';
import { IdleTracker } from './input/IdleTracker';
import { BeatmapStore } from './database/BeatmapStore';
import { RealmDetachedBeatmapStore } from './database/RealmDetachedBeatmapStore';

// C# float.MinValue
const float_min_value = -3.4028234663852886e38;

/** The full osu! experience. Builds on top of OsuGameBase to add menus and binding logic for the screen stack. */
export class OsuGame extends OsuGameBase {
  /** A common shear factor applied to most components of the game. */
  static readonly SHEAR = new Vector2(Math.fround(0.2), 0);

  /** For elements placed close to the screen edge, this is the margin to leave to the edge. */
  static readonly SCREEN_EDGE_MARGIN = 12;

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

  private detachedBeatmapStore!: RealmDetachedBeatmapStore;

  private screenStackFooter!: ScreenStackFooter;

  protected get screenFooter(): ScreenFooter {
    return this.screenStackFooter.footer;
  }

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

    // loadComponentSingleFile<BeatmapStore>(detachedBeatmapStore = new RealmDetachedBeatmapStore(), Add, true)
    this.osuDependencies.cacheAs(BeatmapStore, this.detachedBeatmapStore = new RealmDetachedBeatmapStore());
    this.add(this.detachedBeatmapStore);

    // (The session idle tracker, which resets SessionStatics after 5 minutes of inactivity, is not ported yet.)
    this.osuDependencies.cacheAs(IdleTracker, this.idleTracker = new GameIdleTracker(6000));

    let backReceptor!: BackReceptor;
    let screenStackFooter!: ScreenStackFooter;
    // (the footer tracks the stack it is constructed with, so the stack is created first)
    const screenStack = new OsuScreenStack().with({ relativeSizeAxes: Axes.Both });

    this.addRange([
      this.screenOffsetContainer = new Container().with({
        relativeSizeAxes: Axes.Both,
        children: [
          this.screenContainer = new ScalingContainer(ScalingMode.ExcludeOverlays).with({
            relativeSizeAxes: Axes.Both,
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            children: [
              backReceptor = new BackReceptor(),
              this.screenStack = screenStack,
              this.logoContainer = new Container().with({ relativeSizeAxes: Axes.Both }),
              // TODO: what is this? why is this?
              // TODO: this is being screen scaled even though it's probably AN OVERLAY.
              this.footerBasedOverlayContent = new Container().with({
                depth: -1,
                relativeSizeAxes: Axes.Both,
              }),
              // (PopoverContainer: popovers aren't ported, so it is a plain container.)
              new Container().with({
                // Ensure the footer is displayed above any content and/or overlays.
                depth: -1,
                relativeSizeAxes: Axes.Both,
                child: screenStackFooter = new ScreenStackFooter(screenStack, backReceptor, {
                  // TODO: this is really really weird and should not exist.
                  requestLogoInFront: inFront => this.screenContainer.changeChildDepth(this.logoContainer, inFront ? float_min_value : 0),
                  backButtonPressed: () => this.handleBackButton(),
                }),
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

    this.screenStackFooter = screenStackFooter;
    this.osuDependencies.cache(this.screenFooter);

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

  private handleBackButton(): void {
    // TODO: this is SUPER SUPER bad.
    // It can potentially exit the wrong screen if screens are not loaded yet.
    // ScreenFooter / ScreenBackButton should be aware of which screen it is currently being handled by.
    const currentScreen = this.screenStack.currentScreen;
    if (!(currentScreen instanceof OsuScreen)) return;

    if (!currentScreen.isLoaded || (currentScreen.allowUserExit && !currentScreen.onBackButton())) this.screenStack.exit();
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
