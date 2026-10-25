// Ported from osu.Game/Screens/Menu/ButtonSystem.cs
// Not ported yet: the online buttons' API check (there is no API: every online action falls through to the login overlay, which isn't
// ported either, so they do nothing), DailyChallengeButton (online-only; offline it always stays contracted and out of the flow, so it is
// left out), joystick/MIDI triggers, and the toolbar show/hide (no toolbar yet).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { InvokeOnDisposal } from '@fw/allocation/InvokeOnDisposal';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { BindableBool } from '@fw/bindables/Bindable';
import { Signal } from '@fw/bindables/Signal';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { KeyDownEvent, UIEvent } from '@fw/input/events/UIEvents';
import { Key } from '@fw/input/Key';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { GameHost } from '@fw/platform/GameHost';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import { LogoTrackingContainer } from '../../graphics/containers/LogoTrackingContainer';
import { OsuIcon } from '../../graphics/OsuIcon';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { IdleTracker } from '../../input/IdleTracker';
import { ButtonArea } from './ButtonArea';
import { MainMenuButton } from './MainMenuButton';
import type { OsuLogo } from './OsuLogo';

export enum ButtonSystemState {
  Exit,
  Initial,
  TopLevel,
  Play,
  Multi,
  Edit,
  EnteringMode,
}

/** MainMenu.FADE_OUT_DURATION (MainMenu imports this file, so the constant is repeated here). */
const main_menu_fade_out_duration = 400;

const rgb = (r: number, g: number, b: number): Colour4 => new Colour4(r / 255, g / 255, b / 255, 1);

export class ButtonSystem extends Container implements IKeyBindingHandler<GlobalAction> {
  static readonly BUTTON_WIDTH = 140;
  static readonly WEDGE_WIDTH = 20;

  readonly keyBindingActionTypes = [GlobalAction];

  readonly stateChanged = new Signal<ButtonSystemState>();

  onEditBeatmap: (() => void) | null = null;
  onEditSkin: (() => void) | null = null;
  onExit: ((e: UIEvent) => void) | null = null;
  onBeatmapListing: (() => void) | null = null;
  onSolo: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onMultiplayer: (() => void) | null = null;
  onQuickPlay: (() => void) | null = null;
  onRankedPlay: (() => void) | null = null;
  onPlaylists: (() => void) | null = null;

  private readonly isIdle = new BindableBool();

  private logo: OsuLogo | null = null;

  /**
   * Assign the OsuLogo that this ButtonSystem should manage the position of.
   * @param logo The instance of the logo to be assigned. If null, we are suspending from the screen that uses this ButtonSystem.
   */
  setOsuLogo(logo: OsuLogo | null): void {
    this.logo = logo;

    if (this.logo !== null) {
      this.logo.action = () => this.onOsuLogo();

      // osuLogo.SizeForFlow relies on loading to be complete.
      this.buttonArea.flow.position = new Vector2(Math.fround(ButtonSystem.WEDGE_WIDTH * 2 - (ButtonSystem.BUTTON_WIDTH + Math.fround(this.logo.sizeForFlow / 4))), 0);

      this.updateLogoState();
    } else {
      // We should stop tracking as the facade is now out of scope.
      this.logoTracking?.dispose();
      this.logoTracking = null;
    }
  }

  private readonly buttonArea: ButtonArea;

  private readonly backButton: MainMenuButton;

  private readonly buttonsTopLevel: MainMenuButton[] = [];
  private readonly buttonsPlay: MainMenuButton[] = [];
  private readonly buttonsMulti: MainMenuButton[] = [];
  private readonly buttonsEdit: MainMenuButton[] = [];

  private sampleBackToLogo: Sample | null = null;
  private sampleLogoSwoosh: Sample | null = null;

  private readonly logoTrackingContainer: LogoTrackingContainer;

  returnToTopOnIdle = true;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;

    let buttonArea!: ButtonArea;

    this.child = this.logoTrackingContainer = new LogoTrackingContainer().with({
      relativeSizeAxes: Axes.Both,
      child: buttonArea = new ButtonArea(),
    });

    this.buttonArea = buttonArea;

    buttonArea.addRange([
      new MainMenuButton('settings', '', OsuIcon.Settings, rgb(85, 85, 85), () => this.onSettings?.(), Key.O, Key.S).with({
        buttonPadding: MarginPadding.of({ right: ButtonSystem.WEDGE_WIDTH }),
      }),
      this.backButton = new MainMenuButton('back', 'back-to-top', OsuIcon.PrevCircle, rgb(51, 58, 94), () => {
        switch (this.state) {
          case ButtonSystemState.Multi:
            this.state = ButtonSystemState.Play;
            break;

          default:
            this.state = ButtonSystemState.TopLevel;
            break;
        }
      }).with({
        buttonPadding: MarginPadding.of({ right: ButtonSystem.WEDGE_WIDTH }),
        visibleStateMin: ButtonSystemState.Play,
        visibleStateMax: ButtonSystemState.Edit,
      }),
      this.logoTrackingContainer.logoFacade.with({ scale: new Vector2(Math.fround(0.74)) }),
    ]);

    buttonArea.flow.centreTarget = this.logoTrackingContainer.logoFacade;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const audio = dependencies.resolve(AudioManager);
    const idleTracker = dependencies.get(IdleTracker);
    const host = dependencies.resolve(GameHost);

    this.buttonsPlay.push(new MainMenuButton('solo', 'button-default-select', OsuIcon.Player, rgb(102, 68, 204), () => this.onSolo?.(), Key.P).with({
      buttonPadding: MarginPadding.of({ left: ButtonSystem.WEDGE_WIDTH }),
    }));
    this.buttonsPlay.push(new MainMenuButton('multi', 'button-default-select', OsuIcon.Online, rgb(94, 63, 186), () => this.state = ButtonSystemState.Multi, Key.M));
    this.buttonsPlay.push(new MainMenuButton('playlists', 'button-default-select', OsuIcon.Tournament, rgb(94, 63, 186), () => this.onPlaylistsClick(), Key.L));
    this.buttonsPlay.forEach(b => b.visibleState = ButtonSystemState.Play);

    this.buttonsMulti.push(new MainMenuButton('lounge', 'button-default-select', FontAwesome.Solid.Couch, rgb(94, 63, 186), () => this.onMultiplayerClick(), Key.L, Key.M).with({
      buttonPadding: MarginPadding.of({ left: ButtonSystem.WEDGE_WIDTH }),
    }));
    this.buttonsMulti.push(new MainMenuButton('ranked play', 'button-daily-select', FontAwesome.Solid.Crown, rgb(94, 63, 186), () => this.onRankedPlayClick(), Key.R));
    // disabled for now to give ranked play space.
    // buttonsMulti.Add(new MainMenuButton(ButtonSystemStrings.QuickPlay, @"button-daily-select", FontAwesome.Solid.Bolt, new Color4(94, 63, 186, 255), onQuickPlay, Key.Q));
    this.buttonsMulti.forEach(b => b.visibleState = ButtonSystemState.Multi);

    this.buttonsEdit.push(new MainMenuButton('beatmap editor', 'button-default-select', OsuIcon.Beatmap, rgb(238, 170, 0), () => this.onEditBeatmap?.(), Key.B, Key.E).with({
      buttonPadding: MarginPadding.of({ left: ButtonSystem.WEDGE_WIDTH }),
    }));
    this.buttonsEdit.push(new MainMenuButton('skin editor', 'button-default-select', OsuIcon.SkinB, rgb(220, 160, 0), () => this.onEditSkin?.(), Key.S));
    this.buttonsEdit.forEach(b => b.visibleState = ButtonSystemState.Edit);

    this.buttonsTopLevel.push(new MainMenuButton('play', 'button-play-select', OsuIcon.Logo, rgb(102, 68, 204), () => this.state = ButtonSystemState.Play, Key.P, Key.M, Key.L).with({
      buttonPadding: MarginPadding.of({ left: ButtonSystem.WEDGE_WIDTH }),
    }));
    this.buttonsTopLevel.push(new MainMenuButton('edit', 'button-play-select', OsuIcon.EditCircle, rgb(238, 170, 0), () => this.state = ButtonSystemState.Edit, Key.E));
    this.buttonsTopLevel.push(new MainMenuButton('browse', 'button-default-select', OsuIcon.Beatmap, rgb(165, 204, 0), () => this.onBeatmapListing?.(), Key.B, Key.D));

    if (host.canExit)
      this.buttonsTopLevel.push(new MainMenuButton('exit', '', OsuIcon.CrossCircle, rgb(238, 51, 153), (_, e) => this.onExit?.(e), Key.Q));

    this.buttonArea.addRange(this.buttonsMulti);
    this.buttonArea.addRange(this.buttonsPlay);
    this.buttonArea.addRange(this.buttonsEdit);
    this.buttonArea.addRange(this.buttonsTopLevel);

    for (const b of this.buttonArea.children) {
      if (b instanceof MainMenuButton) {
        b.origin = Anchor.CentreLeft;
        b.anchor = Anchor.CentreLeft;
      }
    }

    this.isIdle.valueChanged.add(idle => this.updateIdleState(idle.newValue));

    if (idleTracker !== null) this.isIdle.bindTo(idleTracker.isIdle);

    void Promise.all([audio.samples.get('Menu/back-to-logo'), audio.samples.get('Menu/osu-logo-swoosh')]).then(([backToLogo, swoosh]) => {
      this.sampleBackToLogo = backToLogo;
      this.sampleLogoSwoosh = swoosh;
    });

    return r;
  }

  // (api.State.Value != APIState.Online: there is no online API, so these always open the (not yet ported) login overlay.)
  private onMultiplayerClick(): void {
  }

  private onRankedPlayClick(): void {
  }

  private onPlaylistsClick(): void {
  }

  private updateIdleState(isIdle: boolean): void {
    if (!this.returnToTopOnIdle)
      return;

    if (isIdle && this.state !== ButtonSystemState.Exit && this.state !== ButtonSystemState.EnteringMode)
      this.state = ButtonSystemState.Initial;
  }

  /**
   * Triggers the logo if the current state is Initial.
   * @returns true if the logo was triggered, false otherwise.
   */
  private triggerInitialOsuLogo(): boolean {
    if (this.state === ButtonSystemState.Initial) {
      this.stopSamplePlayback();
      this.logo?.triggerClick();
      return true;
    }

    return false;
  }

  protected override onKeyDown(e: KeyDownEvent): boolean {
    if (e.repeat || e.controlPressed || e.shiftPressed || e.altPressed || e.superPressed)
      return false;

    if (e.key >= Key.F1 && e.key <= Key.F35)
      return false;

    if (e.key >= Key.Mute && e.key <= Key.TrackNext)
      return false;

    switch (e.key) {
      case Key.Escape:
        return false;
    }

    if (this.triggerInitialOsuLogo())
      return true;

    return super.onKeyDown(e);
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.repeat)
      return false;

    switch (e.action) {
      case GlobalAction.Back:
        return this.goBack();

      case GlobalAction.Select:
        this.logo?.triggerClick();
        return true;

      default:
        return false;
    }
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }

  private goBack(): boolean {
    switch (this.state) {
      case ButtonSystemState.TopLevel:
        this.state = ButtonSystemState.Initial;

        // Samples are explicitly played here in response to user interaction and not when transitioning due to idle.
        this.stopSamplePlayback();
        this.sampleBackToLogo?.play();

        return true;

      case ButtonSystemState.Edit:
      case ButtonSystemState.Play:
      case ButtonSystemState.Multi:
        this.stopSamplePlayback();
        this.backButton.triggerClick();
        return true;

      default:
        return false;
    }
  }

  stopSamplePlayback(): void {
    this.buttonsPlay.forEach(button => button.stopSamplePlayback());
    this.buttonsMulti.forEach(button => button.stopSamplePlayback());
    this.buttonsTopLevel.forEach(button => button.stopSamplePlayback());
    this.logo?.stopSamplePlayback();
  }

  private onOsuLogo(): boolean {
    switch (this._state) {
      default:
        return false;

      case ButtonSystemState.Initial:
        this.state = ButtonSystemState.TopLevel;
        return true;

      case ButtonSystemState.TopLevel:
        this.buttonsTopLevel[0].triggerClick();
        return false;

      case ButtonSystemState.Play:
        this.buttonsPlay[0].triggerClick();
        return false;

      case ButtonSystemState.Multi:
        this.buttonsMulti[0].triggerClick();
        return false;

      case ButtonSystemState.Edit:
        this.buttonsEdit[0].triggerClick();
        return false;
    }
  }

  private _state = ButtonSystemState.Initial;

  override get handleNonPositionalInput(): boolean {
    return this._state !== ButtonSystemState.Exit;
  }

  override get handlePositionalInput(): boolean {
    return this._state !== ButtonSystemState.Exit;
  }

  get state(): ButtonSystemState {
    return this._state;
  }

  set state(value: ButtonSystemState) {
    if (this._state === value) return;

    const lastState = this._state;
    this._state = value;

    this.updateLogoState(lastState);

    this.buttonArea.finishTransforms(true);

    const sequence = this.buttonArea.beginDelayedSequence(lastState === ButtonSystemState.Initial ? 150 : 0);

    try {
      this.buttonArea.buttonSystemState = this._state;

      for (const b of this.buttonArea.children) {
        if (b instanceof MainMenuButton)
          b.buttonSystemState = this._state;
      }
    } finally {
      sequence.dispose();
    }

    this.stateChanged.emit(this.state);
  }

  private logoDelayedAction: ScheduledDelegate | null = null;
  private logoTracking: InvokeOnDisposal | null = null;

  private updateLogoState(lastState = ButtonSystemState.Initial): void {
    const logo = this.logo;
    if (logo === null) return;

    switch (this._state) {
      case ButtonSystemState.Exit:
      case ButtonSystemState.Initial:
        this.logoDelayedAction?.cancel();
        this.logoDelayedAction = this.scheduler.addDelayed(() => {
          this.logoTracking?.dispose();
          this.logoTracking = null;

          this.logo?.clearTransforms(false, 'position');
          this.logo?.moveTo(new Vector2(0.5), 800, Easing.OutExpo);
          this.logo?.scaleTo(1, 800, Easing.OutExpo);
        }, this.buttonArea.alpha * 150);

        if (lastState === ButtonSystemState.TopLevel)
          this.sampleLogoSwoosh?.play();
        break;

      case ButtonSystemState.TopLevel:
      case ButtonSystemState.Play:
        switch (lastState) {
          case ButtonSystemState.TopLevel: // coming from toplevel to play
            break;

          case ButtonSystemState.Initial: {
            logo.clearTransforms(false, 'position');

            const impact = logo.scale.x > Math.fround(0.6);

            logo.scaleTo(0.5, 200, Easing.In);

            this.logoTracking?.dispose();
            this.logoTracking = this.logoTrackingContainer.startTracking(logo, 200, Easing.In);

            this.logoDelayedAction?.cancel();
            this.logoDelayedAction = this.scheduler.addDelayed(() => {
              if (impact)
                this.logo?.impact();
            }, 200);
            break;
          }

          default:
            logo.clearTransforms(false, 'position');

            this.logoTracking?.dispose();
            this.logoTracking = this.logoTrackingContainer.startTracking(logo, 0, Easing.In);

            logo.scaleTo(0.5, 200, Easing.OutQuint);
            break;
        }

        break;

      case ButtonSystemState.EnteringMode:
        this.logoTracking?.dispose();
        this.logoTracking = this.logoTrackingContainer.startTracking(logo, lastState === ButtonSystemState.Initial ? main_menu_fade_out_duration : 0, Easing.InSine);
        break;
    }
  }
}
