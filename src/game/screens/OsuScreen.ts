// Ported from osu.Game/Screens/OsuScreen.cs (and IOsuScreen.cs)
// Not ported yet: user activity and mods (online and gameplay features).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Bindable } from '@fw/bindables/Bindable';
import { Easing } from '@fw/transforms/Easing';
import { Anchor, Axes } from '@fw/layout/Enums';
import type { ScreenExitEvent, ScreenTransitionEvent } from '@fw/screens/IScreen';
import { Screen } from '@fw/screens/Screen';
import type { WorkingBeatmap } from '../beatmaps/WorkingBeatmap';
import { MusicController } from '../overlays/MusicController';
import { OverlayActivation } from '../overlays/OverlayActivation';
import { OsuLogo } from './menu/OsuLogo';
import type { RulesetInfo } from '../rulesets/RulesetInfo';
import type { Drawable } from '@fw/graphics/Drawable';
import { ScreenFooter } from './footer/ScreenFooter';
import type { ScreenFooterButton } from './footer/ScreenFooterButton';
import type { BackgroundScreen } from './BackgroundScreen';
import { BackgroundScreenStack } from './BackgroundScreenStack';
import { OsuScreenDependencies } from './OsuScreenDependencies';

export abstract class OsuScreen extends Screen {
  /**
   * The amount of negative padding that should be applied to game background content which touches both the left and right sides of the screen.
   * This allows for the game content to be pushed by the options/notification overlays without causing black areas to appear.
   */
  static readonly HORIZONTAL_OVERFLOW_PADDING = 50;

  /** A user-facing title for this screen. */
  get title(): string {
    return this.constructor.name;
  }

  get description(): string {
    return this.title;
  }

  /** Whether the user can exit this OsuScreen by pressing the back button. */
  get allowUserExit(): boolean {
    return true;
  }

  /** Whether a footer (and a back button) should be displayed underneath the screen. Temporarily, the back button is shown regardless of whether the footer is shown. */
  get showFooter(): boolean {
    return false;
  }

  /** Whether a top-level component should be allowed to exit the current screen to, for example, complete an import. Note that this can be overridden by a user if they specifically request. */
  get allowExternalScreenChange(): boolean {
    return false;
  }

  /** Whether all overlays should be hidden when this screen is entered or resumed. */
  get hideOverlaysOnEnter(): boolean {
    return false;
  }

  /** Whether the menu cursor should be hidden when non-mouse input is received. */
  get hideMenuCursorOnNonMouseInput(): boolean {
    return false;
  }

  /** Whether this OsuScreen requires the device to be in portrait orientation. */
  get requiresPortraitOrientation(): boolean {
    return false;
  }

  /** The initial overlay activation mode to use when this screen is entered for the first time. */
  protected get initialOverlayActivationMode(): OverlayActivation {
    return OverlayActivation.All;
  }

  readonly overlayActivationMode: Bindable<OverlayActivation>;

  /** The initial visibility state of the back button when this screen is entered for the first time. */
  protected get initialBackButtonVisibility(): boolean {
    return this.allowUserExit;
  }

  readonly backButtonVisibility: Bindable<boolean>;

  /** Whether the menu cursor should be visible. */
  get cursorVisible(): boolean {
    return true;
  }

  /** Whether to disallow changes to game-wise Beatmap/Ruleset bindables for this screen (and all children). */
  get disallowExternalBeatmapRulesetChanges(): boolean {
    return false;
  }

  private sampleExit: Sample | null = null;

  protected get playExitSound(): boolean {
    return true;
  }

  /** The amount of parallax to be applied while this screen is displayed. */
  get backgroundParallaxAmount(): number {
    return 1;
  }

  private musicController!: MusicController;

  /** Whether mod track adjustments should be applied on entering this screen. A null value means that no changes are made to the current setting. */
  get applyModTrackAdjustments(): boolean | null {
    return null;
  }

  /** Whether control of the global track should be allowed via the music controller / now playing overlay. A null value means that the parent screen's value of this setting will be used. */
  get allowGlobalTrackControl(): boolean | null {
    return null;
  }

  beatmap!: Bindable<WorkingBeatmap>;

  ruleset!: Bindable<RulesetInfo>;

  private screenDependencies: OsuScreenDependencies | null = null;

  private globalMusicControlStateAtSuspend: boolean | null = null;

  private modTrackAdjustmentStateAtSuspend: boolean | null = null;

  /** @internal */
  createLeasedDependencies(dependencies: IReadOnlyDependencyContainer): void {
    this.createDependencies(dependencies);
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    if (this.screenDependencies === null) {
      if (this.disallowExternalBeatmapRulesetChanges)
        throw new Error('Screens that specify disallowExternalBeatmapRulesetChanges must be pushed immediately.');

      this.createDependencies(parent);
    }

    return super.createChildDependencies(this.screenDependencies!);
  }

  private createDependencies(dependencies: IReadOnlyDependencyContainer): void {
    this.screenDependencies = new OsuScreenDependencies(this.disallowExternalBeatmapRulesetChanges, dependencies);

    this.beatmap = this.screenDependencies.beatmap;
    this.ruleset = this.screenDependencies.ruleset;
  }

  /** The background created and owned by this screen. May be null if the background didn't change. */
  private ownedBackground: BackgroundScreen | null = null;

  private background: BackgroundScreen | null = null;

  private backgroundStack: BackgroundScreenStack | null = null;

  private logo: OsuLogo | null = null;

  private _footer: ScreenFooter | null = null;

  protected get footer(): ScreenFooter | null {
    return this._footer;
  }

  protected constructor() {
    super();

    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;

    this.overlayActivationMode = new Bindable<OverlayActivation>(this.initialOverlayActivationMode);
    this.backButtonVisibility = new Bindable<boolean>(this.initialBackButtonVisibility);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.musicController = dependencies.resolve(MusicController);
    this.backgroundStack = dependencies.get(BackgroundScreenStack);
    this.logo = dependencies.get(OsuLogo);
    this._footer = dependencies.get(ScreenFooter);

    // [BackgroundDependencyLoader(true)]: the sample arrives asynchronously.
    void dependencies.get(AudioManager)?.samples.get('UI/screen-back').then(s => this.sampleExit = s);

    return r;
  }

  /** Apply arbitrary changes to the current background screen in a thread safe manner. */
  applyToBackground(action: (b: BackgroundScreen) => void): void {
    if (this.backgroundStack === null)
      throw new Error('Attempted to apply to background without a background stack being available.');

    if (this.background === null)
      throw new Error('Attempted to apply to background before screen is pushed.');

    this.background.applyToBackground(action);
  }

  override onResuming(e: ScreenTransitionEvent): void {
    this.applyArrivingDefaults(true);

    // it's feasible to resume to a screen if the target screen never loaded successfully.
    // in such a case there's no need to restore this value.
    if (this.modTrackAdjustmentStateAtSuspend !== null)
      this.musicController.applyModTrackAdjustments = this.modTrackAdjustmentStateAtSuspend;
    if (this.globalMusicControlStateAtSuspend !== null)
      this.musicController.allowTrackControl.value = this.globalMusicControlStateAtSuspend;

    super.onResuming(e);
  }

  override onSuspending(e: ScreenTransitionEvent): void {
    super.onSuspending(e);

    this.modTrackAdjustmentStateAtSuspend = this.musicController.applyModTrackAdjustments;
    this.globalMusicControlStateAtSuspend = this.musicController.allowTrackControl.value;

    this.onSuspendingLogo();
  }

  override onEntering(e: ScreenTransitionEvent): void {
    this.applyArrivingDefaults(false);

    if (this.applyModTrackAdjustments !== null)
      this.musicController.applyModTrackAdjustments = this.applyModTrackAdjustments;

    if (this.allowGlobalTrackControl !== null)
      this.musicController.allowTrackControl.value = this.allowGlobalTrackControl;

    if (this.backgroundStack?.push(this.ownedBackground = this.createBackground()) !== true) {
      // If the constructed instance was not actually pushed to the background stack, we don't want to track it unnecessarily.
      this.ownedBackground?.dispose();
      this.ownedBackground = null;
    }

    this.background = (this.backgroundStack?.currentScreen as BackgroundScreen | null | undefined) ?? null;

    super.onEntering(e);
  }

  override onExiting(e: ScreenExitEvent): boolean {
    // Only play the exit sound if we are the last screen in the exit sequence.
    // This stops many sample playbacks from stacking when a huge screen purge happens (ie. returning to menu via the home button
    // from a deeply nested screen).
    const arrivingAtFinalDestination = e.next === e.destination;

    if (this.validForResume && this.playExitSound && arrivingAtFinalDestination)
      this.sampleExit?.play();

    if (this.validForResume && this.logo !== null)
      this.onExitingLogo();

    if (super.onExiting(e))
      return true;

    if (this.ownedBackground !== null && this.backgroundStack?.currentScreen === this.ownedBackground)
      this.backgroundStack?.exit();

    return false;
  }

  /** Fired when this screen was entered or resumed and the logo state is required to be adjusted. */
  protected logoArriving(logo: OsuLogo, _resuming: boolean): void {
    logo.action = null;
    logo.fadeOut(300, Easing.OutQuint);

    logo.origin = Anchor.Centre;

    logo.changeAnchor(Anchor.TopLeft);
    logo.relativePositionAxes = Axes.Both;

    logo.triangles = true;
    logo.ripple = true;
  }

  private applyArrivingDefaults(isResuming: boolean): void {
    const logo = this.logo;
    logo?.appendAnimatingAction(() => {
      if (this.isCurrentScreen()) this.logoArriving(logo, isResuming);
    }, true);
  }

  private onExitingLogo(): void {
    const logo = this.logo;
    logo?.appendAnimatingAction(() => this.logoExiting(logo), false);
  }

  /** Fired when this screen was exited to add any outwards transition to the logo. */
  protected logoExiting(_logo: OsuLogo): void {
  }

  private onSuspendingLogo(): void {
    const logo = this.logo;
    logo?.appendAnimatingAction(() => this.logoSuspending(logo), false);
  }

  /** Fired when this screen was suspended to add any outwards transition to the logo. */
  protected logoSuspending(_logo: OsuLogo): void {
  }

  /**
   * Override to create a BackgroundMode for the current screen.
   * Note that the instance created may not be the used instance if it matches the BackgroundMode equality clause.
   */
  protected createBackground(): BackgroundScreen | null {
    return null;
  }

  /** @internal */
  loadComponentsAgainstScreenDependencies(components: Iterable<Drawable>): void {
    for (const c of components)
      this.loadComponent(c);
  }

  createFooterButtons(): ScreenFooterButton[] {
    return [];
  }

  /** Invoked when the back button has been pressed to close any overlays before exiting this OsuScreen. Return true to block the exit. */
  onBackButton(): boolean {
    return false;
  }
}
