// Ported from osu.Game/OsuGame.cs (the screen layering and screen change handling, overlay management and PresentBeatmap)
// Not ported yet: the toolbar, most overlays (the beatmap listing is the only one), notifications, cursor, OSD and global key bindings. They
// will be added to the containers below as they are ported. The first screen is supplied by createLoader().

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, type ValueChangedEvent } from '@fw/bindables/Bindable';
import type { WorkingBeatmap } from './beatmaps/WorkingBeatmap';
import { Container } from '@fw/graphics/containers/Container';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Colour4 } from '@fw/graphics/Colour4';
import type { OverlayContainer } from '@fw/graphics/containers/OverlayContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Logger, LoggingTarget } from '@fw/logging/Logger';
import type { IScreen } from '@fw/screens/IScreen';
import { Easing } from '@fw/transforms/Easing';
import type { BeatmapInfo } from './beatmaps/BeatmapInfo';
import type { IBeatmapSetInfo } from './beatmaps/IBeatmapSetInfo';
import { OsuSetting } from './configuration/OsuConfigManager';
import { OsuFocusedOverlayContainer } from './graphics/containers/OsuFocusedOverlayContainer';
import { OsuColour } from './graphics/OsuColour';
import { BeatmapListingOverlay } from './overlays/BeatmapListingOverlay';
import { IOverlayManager } from './overlays/IOverlayManager';
import { PerformFromMenuRunner } from './PerformFromMenuRunner';
import { isHandlePresentBeatmap } from './screens/IHandlePresentBeatmap';
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

  private beatmapListing!: BeatmapListingOverlay;

  private readonly focusedOverlays: OsuFocusedOverlayContainer[] = [];

  private readonly visibleBlockingOverlays: OverlayContainer[] = [];

  private screenStackFooter!: ScreenStackFooter;

  protected get screenFooter(): ScreenFooter {
    return this.screenStackFooter.footer;
  }

  /** Whether overlays should be able to be opened game-wide. Value is sourced from the current active screen. */
  readonly overlayActivationMode = new Bindable<OverlayActivation>(OverlayActivation.All);

  readonly scalingContainerTargetDrawSize = new Vector2(1024, 768);

  /** Close all game-wide overlays. hideToolbar: whether the toolbar should also be hidden (there is no toolbar yet). */
  closeAllOverlays(_hideToolbar = true): void {
    for (const overlay of this.focusedOverlays)
      overlay.hide();

    // (ScreenFooter.ActiveOverlay: footer overlays aren't ported)
  }

  // #region IOverlayManager

  readonly isOverlayManager = true;

  private updateBlockingOverlayFade(): void {
    this.screenContainer.fadeColour(this.visibleBlockingOverlays.length > 0 ? OsuColour.gray(0.5) : Colour4.White, 500, Easing.OutQuint);
  }

  showBlockingOverlay(overlay: OverlayContainer): void {
    if (!this.visibleBlockingOverlays.includes(overlay))
      this.visibleBlockingOverlays.push(overlay);

    this.updateBlockingOverlayFade();
  }

  hideBlockingOverlay(overlay: OverlayContainer): void {
    this.schedule(() => {
      const i = this.visibleBlockingOverlays.indexOf(overlay);
      if (i >= 0) this.visibleBlockingOverlays.splice(i, 1);

      this.updateBlockingOverlayFade();
    });
  }

  // #endregion

  /**
   * Present a beatmap at song select immediately. The user should have already requested this interactively.
   * difficultyCriteria: optional predicate used to narrow the set of difficulties to select from when presenting.
   */
  presentBeatmap(beatmap: IBeatmapSetInfo, difficultyCriteria: ((b: BeatmapInfo) => boolean) | null = null): void {
    Logger.log(`Beginning PresentBeatmap with beatmap ${beatmap.onlineID}`);

    // (Live<BeatmapSetInfo>.PerformRead(s => s.Detach()): the realm's sets are already detached)
    const detachedSet = beatmap.onlineID > 0
      ? this.realm.allBeatmapSets().find(s => s.onlineID === beatmap.onlineID && !s.deletePending) ?? null
      : null;

    if (detachedSet === null) {
      Logger.log('The requested beatmap could not be loaded.', LoggingTarget.Information);
      return;
    }

    this.performFromScreen(screen => {
      // Find beatmaps that match our predicate.
      let beatmaps = detachedSet.beatmaps.filter(b => difficultyCriteria?.(b) ?? true);

      // Use all beatmaps if predicate matched nothing
      if (beatmaps.length === 0)
        beatmaps = [...detachedSet.beatmaps];

      // Prefer recommended beatmap if recommendations are available, else fallback to a sane selection.
      // (there is no DifficultyRecommender: it needs the user's statistics)
      const selection = beatmaps.find(b => b.ruleset.equals(this.ruleset.value)) ?? beatmaps[0];

      if (isHandlePresentBeatmap(screen)) {
        screen.presentBeatmap(this.beatmapManager.getWorkingBeatmap(selection), selection.ruleset);
      } else {
        // Don't change the local ruleset if the user is on another ruleset and is showing converted beatmaps at song select.
        // Eventually we probably want to check whether conversion is actually possible for the current ruleset.
        const requiresRulesetSwitch = !selection.ruleset.equals(this.ruleset.value)
          && (selection.ruleset.onlineID > 0 || !this.localConfig.get<boolean>(OsuSetting.ShowConvertedBeatmaps));

        if (requiresRulesetSwitch) {
          this.ruleset.value = selection.ruleset;
          this.beatmap.value = this.beatmapManager.getWorkingBeatmap(selection);

          Logger.log(`Completing PresentBeatmap with beatmap ${beatmap.onlineID} ruleset ${selection.ruleset}`);
        } else {
          this.beatmap.value = this.beatmapManager.getWorkingBeatmap(selection);

          Logger.log(`Completing PresentBeatmap with beatmap ${beatmap.onlineID} (maintaining ruleset)`);
        }
      }
    // (typeof(SongSelect) and typeof(IHandlePresentBeatmap): SongSelect implements IHandlePresentBeatmap, and importing it here would be
    // circular, as its static members read OsuGame's)
    }, [isHandlePresentBeatmap]);
  }

  private performFromMainMenuTask: PerformFromMenuRunner | null = null;

  /**
   * Perform an action only after returning to a specific screen as indicated by validScreens. Eagerly tries to exit the current screen to
   * achieve this goal.
   */
  performFromScreen(action: (screen: IScreen) => void, validScreens: ((screen: IScreen) => boolean)[] | null = null): void {
    this.performFromMainMenuTask?.cancel();
    this.add(this.performFromMainMenuTask = new PerformFromMenuRunner(action, validScreens, () => this.screenStack.currentScreen));
  }

  protected override createScalingContainer(): Container {
    return new ScalingContainer(ScalingMode.Everything);
  }

  /** The first screen pushed to the screen stack (C#'s Loader, which leads to the intro and the main menu). */
  protected createLoader(): OsuScreen | null {
    return null;
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = super.createChildDependencies(parent);

    // [Cached(typeof(OsuGame))], and IOverlayManager is a [Cached] interface.
    this.osuDependencies.cacheAs(OsuGame, this);
    this.osuDependencies.cacheAs(IOverlayManager, this);

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

    this.loadComponentSingleFile(this.beatmapListing = new BeatmapListingOverlay(), d => this.gameOverlayContent.add(d), true);

    // ensure only one of these overlays are open at once.
    const singleDisplayOverlays: OverlayContainer[] = [this.beatmapListing];

    for (const overlay of singleDisplayOverlays) {
      overlay.state.valueChanged.add(state => {
        // (informational overlays, the beatmap set and user profile, aren't ported)

        if (state.newValue !== Visibility.Hidden)
          this.showOverlayAboveOthers(overlay, singleDisplayOverlays);
      });
    }

    this.overlayActivationMode.valueChanged.add(mode => {
      if (mode.newValue !== OverlayActivation.All) this.closeAllOverlays();
    });

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

  private showOverlayAboveOthers(overlay: OverlayContainer, otherOverlays: OverlayContainer[]): void {
    otherOverlays.filter(o => o !== overlay).forEach(o => o.hide());

    // (Settings and Notifications aren't ported)

    // Partially visible so leave it at the current depth.
    if (overlay.isPresent)
      return;

    // Show above all other overlays.
    if (overlay.isLoaded)
      this.gameOverlayContent.changeChildDepth(overlay, Math.fround(-this.clock!.currentTime));
    else
      overlay.depth = Math.fround(-this.clock!.currentTime);
  }

  private asyncLoadStream: Promise<unknown> | null = null;

  /**
   * Queues loading the provided component in sequential fashion.
   * cache: whether to cache the component as its type into the game dependencies before any scheduling.
   */
  private loadComponentSingleFile<T extends Drawable>(component: T, loadCompleteAction: (d: T) => void, cache = false): T {
    if (cache)
      this.osuDependencies.cacheAs(component.constructor as abstract new (...args: never[]) => T, component);

    if (component instanceof OsuFocusedOverlayContainer)
      this.focusedOverlays.push(component);

    // schedule is here to ensure that all component loads are done after LoadComplete is run (and thus all dependencies are cached).
    this.schedule(() => {
      const previousLoadStream = this.asyncLoadStream;

      // chain with existing load stream
      this.asyncLoadStream = (async () => {
        if (previousLoadStream !== null)
          await previousLoadStream;

        try {
          Logger.log(`Loading ${component}...`);
          await this.loadComponentAsync(component, loadCompleteAction);
          Logger.log(`Loaded ${component}!`);
        } catch (e) {
          Logger.error(e, `Failed to load ${component}`);
        }
      })();
    });

    return component;
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
