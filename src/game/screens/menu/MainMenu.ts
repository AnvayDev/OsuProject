// Ported from osu.Game/Screens/Menu/MainMenu.cs
// Not ported yet: HoldToExitGameOverlay, the exit confirmation dialog (there is no dialog overlay, so exiting never asks), GlobalScrollAdjustsVolume
// (no volume overlay), KiaiMenuFountains, the login overlay / mobile disclaimer shown on the first logo click, the storage error dialog,
// ISamplePlaybackDisabler (only the fountains use it), and the screens the buttons open (song select, editor, settings, beatmap listing,
// online play): their actions do nothing yet.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScreenExitEvent, ScreenTransitionEvent } from '@fw/screens/IScreen';
import { Easing } from '@fw/transforms/Easing';
import { ParallaxContainer } from '../../graphics/containers/ParallaxContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { MusicController } from '../../overlays/MusicController';
import { OverlayActivation } from '../../overlays/OverlayActivation';
import type { BackgroundScreen } from '../BackgroundScreen';
import { BackgroundScreenDefault } from '../backgrounds/BackgroundScreenDefault';
import { OsuScreen } from '../OsuScreen';
import { ButtonSystem, ButtonSystemState } from './ButtonSystem';
import { MenuSideFlashes } from './MenuSideFlashes';
import { MenuTipDisplay } from './MenuTipDisplay';
import { OnlineMenuBanner } from './OnlineMenuBanner';
import type { OsuLogo } from './OsuLogo';
import { SoloSongSelect } from '../select/SoloSongSelect';
import { SongTicker } from './SongTicker';
import { SupporterDisplay } from './SupporterDisplay';

export class MainMenu extends OsuScreen {
  static readonly FADE_IN_DURATION = 300;

  static readonly FADE_OUT_DURATION = 400;

  constructor() {
    super();
  }

  override get hideOverlaysOnEnter(): boolean {
    return this.buttons === undefined || this.buttons.state === ButtonSystemState.Initial;
  }

  override get allowUserExit(): boolean {
    return false;
  }

  override get allowExternalScreenChange(): boolean {
    return true;
  }

  override get allowGlobalTrackControl(): boolean | null {
    return true;
  }

  private sideFlashes!: MenuSideFlashes;

  protected buttons!: ButtonSystem;

  /** C#'s [Resolved] musicController (OsuScreen has its own private one). */
  private menuMusicController!: MusicController;

  protected override createBackground(): BackgroundScreen {
    return new BackgroundScreenDefault();
  }

  protected override get playExitSound(): boolean {
    return false;
  }

  private buttonsContainer!: ParallaxContainer;
  private songTicker!: SongTicker;
  private logoTarget!: Container;
  private onlineMenuBanner!: OnlineMenuBanner;
  private menuTipDisplay!: MenuTipDisplay;
  private bottomElementsFlow!: FillFlowContainer;
  private supporterDisplay!: SupporterDisplay;

  private reappearSampleSwoosh: Sample | null = null;

  private logoProxy: { dispose(): void } | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.menuMusicController = dependencies.resolve(MusicController);
    const audio = dependencies.resolve(AudioManager);

    this.addRangeInternal([
      this.buttonsContainer = new ParallaxContainer().with({
        parallaxAmount: Math.fround(0.01),
        children: [
          this.buttons = new ButtonSystem().with({
            // (OnEditBeatmap, OnEditSkin, OnMultiplayer, OnQuickPlay, OnRankedPlay, OnPlaylists and OnDailyChallenge push screens that
            // aren't ported yet.)
            onSolo: () => this.loadSongSelect(),
            // (C# also records whether the exit came from a mouse click, which only decides whether the exit dialog is shown.)
            onExit: () => this.exit(),
          }),
        ],
      }),
      this.logoTarget = new Container().with({ relativeSizeAxes: Axes.Both }),
      this.sideFlashes = new MenuSideFlashes(),
      this.songTicker = new SongTicker().with({
        anchor: Anchor.TopRight,
        origin: Anchor.TopRight,
        margin: MarginPadding.of({ right: 15, top: 5 }),
      }),
      this.bottomElementsFlow = new FillFlowContainer().with({
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Vertical,
        anchor: Anchor.BottomCentre,
        origin: Anchor.BottomCentre,
        spacing: new Vector2(5),
        children: [
          this.menuTipDisplay = new MenuTipDisplay().with({
            anchor: Anchor.TopCentre,
            origin: Anchor.TopCentre,
          }),
          this.onlineMenuBanner = new OnlineMenuBanner().with({
            anchor: Anchor.TopCentre,
            origin: Anchor.TopCentre,
          }),
        ],
      }),
      this.supporterDisplay = new SupporterDisplay().with({
        margin: new MarginPadding(5),
        anchor: Anchor.TopLeft,
        origin: Anchor.TopLeft,
      }),
    ]);

    const baseDim = 1;

    this.buttons.stateChanged.add(state => {
      switch (state) {
        case ButtonSystemState.Initial:
        case ButtonSystemState.Exit:
          this.applyToBackground(b => b.fadeColour(OsuColour.gray(baseDim), 500, Easing.OutSine));
          this.onlineMenuBanner.state.value = Visibility.Hidden;
          break;

        default:
          this.applyToBackground(b => b.fadeColour(OsuColour.gray(Math.fround(baseDim * Math.fround(0.8))), 500, Easing.OutSine));
          this.onlineMenuBanner.state.value = Visibility.Visible;
          break;
      }
    });

    // (Buttons.OnSettings and OnBeatmapListing toggle overlays that aren't ported yet.)

    void audio.samples.get('Menu/reappear-swoosh').then(s => this.reappearSampleSwoosh = s);

    return r;
  }

  returnToOsuLogo(): void {
    this.buttons.state = ButtonSystemState.Initial;
  }

  override onEntering(e: ScreenTransitionEvent): void {
    super.onEntering(e);
    this.buttons.fadeInFromZero(500);

    // (When arriving from an IntroScreen, C# restarts the current track here if it isn't running. There is no intro yet.)
  }

  protected override logoArriving(logo: OsuLogo, resuming: boolean): void {
    super.logoArriving(logo, resuming);

    this.buttons.setOsuLogo(logo);

    logo.fadeColour(Colour4.White, 100, Easing.OutQuint);
    logo.fadeIn(100, Easing.OutQuint);

    this.logoProxy = logo.proxyToContainer(this.logoTarget);

    if (resuming) {
      this.buttons.state = ButtonSystemState.TopLevel;

      this.fadeIn(MainMenu.FADE_IN_DURATION, Easing.OutQuint);
      this.buttonsContainer.moveTo(new Vector2(0, 0), MainMenu.FADE_IN_DURATION, Easing.OutQuint);

      this.sideFlashes.delay(MainMenu.FADE_IN_DURATION).fadeIn(64, Easing.InQuint);
    }

    // (Otherwise C# wraps logo.Action to show the mobile disclaimer or the login overlay on the first click; neither is ported.)
  }

  protected override logoSuspending(logo: OsuLogo): void {
    const seq = logo.fadeOut(300, Easing.InSine)
      .scaleTo(Math.fround(0.2), 300, Easing.InSine);

    this.logoProxy?.dispose();
    this.logoProxy = null;

    seq.onComplete(() => this.buttons.setOsuLogo(null));
    seq.onAbort(() => this.buttons.setOsuLogo(null));
  }

  protected override logoExiting(logo: OsuLogo): void {
    super.logoExiting(logo);

    this.logoProxy?.dispose();
    this.logoProxy = null;
  }

  override onSuspending(e: ScreenTransitionEvent): void {
    super.onSuspending(e);

    this.buttons.state = ButtonSystemState.EnteringMode;

    this.fadeOut(MainMenu.FADE_OUT_DURATION, Easing.InSine);
    this.buttonsContainer.moveTo(new Vector2(-800, 0), MainMenu.FADE_OUT_DURATION, Easing.InSine);

    this.sideFlashes.fadeOut(64, Easing.OutQuint);

    this.bottomElementsFlow
      .scaleTo(Math.fround(0.9), 1000, Easing.OutQuint)
      .fadeOut(500, Easing.OutQuint);

    this.supporterDisplay
      .fadeOut(500, Easing.OutQuint);
  }

  override onResuming(e: ScreenTransitionEvent): void {
    super.onResuming(e);

    // Ensures any playing `ButtonSystem` samples are stopped when returning to MainMenu (as to not overlap with the 'back' sample)
    this.buttons.stopSamplePlayback();
    this.reappearSampleSwoosh?.play();

    this.applyToBackground(b => (b instanceof BackgroundScreenDefault ? b : null)?.next());

    this.menuMusicController.ensurePlayingSomething();

    // Cycle tip on resuming
    this.menuTipDisplay.showNextTip();

    this.bottomElementsFlow
      .scaleTo(1, 1000, Easing.OutQuint)
      .fadeIn(1000, Easing.OutQuint);
  }

  private loadSongSelect(): void {
    this.push(new SoloSongSelect());
  }

  override onExiting(e: ScreenExitEvent): boolean {
    // (C# first asks for confirmation through the dialog overlay unless the exit was confirmed by holding or clicking; without a dialog
    // overlay it never does.)

    this.buttons.state = ButtonSystemState.Exit;
    this.overlayActivationMode.value = OverlayActivation.Disabled;

    this.songTicker.hide();

    this.fadeOut(3000);

    this.bottomElementsFlow
      .fadeOut(500, Easing.OutQuint);

    this.supporterDisplay
      .fadeOut(500, Easing.OutQuint);

    return super.onExiting(e);
  }
}
