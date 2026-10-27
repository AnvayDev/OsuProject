// Ported from osu.Game/Screens/Footer/ScreenFooter.cs
// Not ported: ShearedOverlayContainer footer content (RegisterActiveOverlayContainer and the colour scheme switch it drives; the mod select
// overlay is its only song select user) and popovers (HidePopover).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import type { InvokeOnDisposal } from '@fw/allocation/InvokeOnDisposal';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { OverlayContainer } from '@fw/graphics/containers/OverlayContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import { LogoTrackingContainer } from '../../graphics/containers/LogoTrackingContainer';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';
import { OverlayColourScheme } from '../../overlays/OverlayColourScheme';
import type { OsuLogo } from '../menu/OsuLogo';
import { ScreenBackButton } from './ScreenBackButton';
import { ScreenFooterButton } from './ScreenFooterButton';

const padding = 60;
const delay_per_button = 30;
const transition_duration = 500;

export class BackReceptor extends Drawable implements IKeyBindingHandler<GlobalAction> {
  readonly keyBindingActionTypes = [GlobalAction];

  onBackPressed: (() => void) | null = null;

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.repeat)
      return false;

    switch (e.action) {
      case GlobalAction.Back:
        this.onBackPressed?.();
        return true;
    }

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }
}

export class ScreenFooter extends OverlayContainer {
  private _backButton!: ScreenBackButton;

  get backButton(): ScreenBackButton {
    return this._backButton;
  }

  /** Called when logo tracking begins, intended to bring the osu! logo to the frontmost visually. */
  requestLogoInFront: ((inFront: boolean) => void) | null = null;

  /** The back button was pressed. */
  backButtonPressed: (() => void) | null = null;

  static readonly HEIGHT = 50;

  // Disable masking because it breaks due to the height of this container being less than the displayed content.
  // The height being set as it is is required for transition purposes.
  override updateSubTreeMasking(): boolean {
    return false;
  }

  private readonly overlays: OverlayContainer[] = [];

  private background!: Box;
  private buttonsFlow!: FillFlowContainer<ScreenFooterButton>;
  private hiddenButtonsContainer!: Container<ScreenFooterButton>;

  private logoTrackingContainer!: LogoTrackingContainer;
  private logoTracking: InvokeOnDisposal | null = null;

  // TODO: This has some weird update logic local in this class, but it only works for overlay containers.
  // This is not what we want. The footer is to be displayed on *screens* with different colour schemes.
  // It needs to update on screen switch.
  //
  // For now it's locked to Blue to match song select (the most prominent usage).
  private readonly colourProvider = new OverlayColourProvider(OverlayColourScheme.Blue);

  constructor(receptor: BackReceptor | null = null) {
    super();

    this.relativeSizeAxes = Axes.X;
    this.height = ScreenFooter.HEIGHT;
    this.anchor = Anchor.BottomLeft;
    this.origin = Anchor.BottomLeft;

    if (receptor === null)
      this.add(receptor = new BackReceptor());

    receptor.onBackPressed = () => this._backButton.triggerClick();
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    // [Cached] colourProvider
    dependencies.cache(this.colourProvider);
    return dependencies;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.logoTrackingContainer = new LogoTrackingContainer().with({
      relativeSizeAxes: Axes.Both,
    });

    const facade = this.logoTrackingContainer.logoFacade;
    facade.anchor = Anchor.BottomRight;
    facade.origin = Anchor.Centre;
    facade.position = new Vector2(-76, -36);
    this.logoTrackingContainer.child = facade;

    this.internalChildren = [
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: this.colourProvider.background5,
      }),
      new GridContainer().with({
        relativeSizeAxes: Axes.Both,
        padding: MarginPadding.of({ left: OsuGame.SCREEN_EDGE_MARGIN + ScreenBackButton.BUTTON_WIDTH + padding }),
        columnDimensions: [
          new Dimension(GridSizeMode.AutoSize),
          new Dimension(),
        ],
        content: [
          [
            this.buttonsFlow = new FillFlowContainer<ScreenFooterButton>().with({
              name: 'Visible footer buttons',
              anchor: Anchor.BottomLeft,
              origin: Anchor.BottomLeft,
              y: ScreenFooterButton.CORNER_RADIUS,
              direction: FillDirection.Horizontal,
              spacing: new Vector2(7, 0),
              autoSizeAxes: Axes.Both,
            }),
            new Container().with({
              name: 'Overlay-provided extra content',
              relativeSizeAxes: Axes.Both,
              y: -OsuGame.SCREEN_EDGE_MARGIN,
            }),
          ],
        ],
      }),
      this._backButton = new ScreenBackButton().with({
        margin: MarginPadding.of({ bottom: OsuGame.SCREEN_EDGE_MARGIN, left: OsuGame.SCREEN_EDGE_MARGIN }),
        anchor: Anchor.BottomLeft,
        origin: Anchor.BottomLeft,
        action: () => this.onBackPressed(),
      }),
      this.hiddenButtonsContainer = new Container<ScreenFooterButton>().with({
        name: 'Hidden footer buttons',
        margin: MarginPadding.of({ left: OsuGame.SCREEN_EDGE_MARGIN + ScreenBackButton.BUTTON_WIDTH + padding }),
        y: ScreenFooterButton.CORNER_RADIUS,
        anchor: Anchor.BottomLeft,
        origin: Anchor.BottomLeft,
        autoSizeAxes: Axes.Both,
      }),
      this.logoTrackingContainer,
    ];

    return r;
  }

  private changeLogoDepthDelegate: ScheduledDelegate | null = null;

  startTrackingLogo(logo: OsuLogo, duration = 0, easing = Easing.None): void {
    this.changeLogoDepthDelegate?.cancel();
    this.changeLogoDepthDelegate = null;

    this.logoTracking = this.logoTrackingContainer.startTracking(logo, duration, easing);
    this.requestLogoInFront?.(true);
  }

  stopTrackingLogo(): void {
    this.logoTracking?.dispose();
    this.logoTracking = null;

    this.changeLogoDepthDelegate = this.scheduler.addDelayed(() => this.requestLogoInFront?.(false), transition_duration);
  }

  protected override popIn(): void {
    this.buttonsFlow.fadeIn(transition_duration / 4, Easing.OutQuint);

    this.moveToY(0, transition_duration, Easing.OutQuint)
      .fadeIn();
  }

  protected override popOut(): void {
    // Really we shouldn't need to do this, but some buttons protrude vertically more than expected
    // (see FooterButtonMods).
    this.buttonsFlow.fadeOut(transition_duration, Easing.OutQuint);

    this.moveToY(ScreenFooterButton.HEIGHT, transition_duration, Easing.OutQuint)
      .then()
      .fadeOut();
  }

  setButtons(buttons: readonly ScreenFooterButton[]): void {
    this.overlays.length = 0;

    const oldButtons = [...this.buttonsFlow.children];

    for (let i = 0; i < oldButtons.length; i++) {
      const oldButton = oldButtons[i];
      oldButton.state.value = Visibility.Hidden;

      this.buttonsFlow.remove(oldButton, false);
      this.hiddenButtonsContainer.add(oldButton);

      if (buttons.length > 0)
        this.makeButtonDisappearToRight(oldButton, i, oldButtons.length, true);
      else
        this.makeButtonDisappearToBottom(oldButton, i, oldButtons.length, true);
    }

    for (let i = 0; i < buttons.length; i++) {
      const newButton = buttons[i];

      if (newButton.overlay !== null) {
        const overlay = newButton.overlay;
        newButton.action = () => this.showOverlay(overlay);
        this.overlays.push(overlay);
      }

      this.buttonsFlow.add(newButton);

      const index = i;

      // ensure transforms are added after LoadComplete to not be aborted by the FinishTransforms call.
      newButton.onLoadComplete.add(() => {
        if (oldButtons.length > 0)
          this.makeButtonAppearFromLeft(newButton, index, buttons.length, 240);
        else
          this.makeButtonAppearFromBottom(newButton, index);
      });
    }
  }

  private makeButtonAppearFromLeft(button: ScreenFooterButton, index: number, count: number, startDelay: number): void {
    button.appearFromLeft(startDelay + (count - index) * delay_per_button);
  }

  private makeButtonAppearFromBottom(button: ScreenFooterButton, index: number): void {
    button.appearFromBottom(index * delay_per_button);
  }

  private makeButtonDisappearToRight(button: ScreenFooterButton, index: number, count: number, expire: boolean): void {
    button.disappearToRight((count - index) * delay_per_button, expire);
  }

  private makeButtonDisappearToBottom(button: ScreenFooterButton, index: number, count: number, expire: boolean): void {
    button.disappearToBottom((count - index) * delay_per_button, expire);
  }

  private showOverlay(overlay: OverlayContainer): void {
    for (const o of this.overlays.filter(o => o !== overlay))
      o.hide();

    overlay.toggleVisibility();
  }

  private onBackPressed(): void {
    this.backButtonPressed?.();
  }
}
