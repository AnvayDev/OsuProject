// Ported from osu.Game/Overlays/Toolbar/Toolbar.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableBool, type ValueChangedEvent } from '@fw/bindables/Bindable';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { OverlayContainer } from '@fw/graphics/containers/OverlayContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, Direction, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuScrollContainer } from '../../graphics/containers/OsuScrollContainer';
import { OsuColour } from '../../graphics/OsuColour';
// (circular: OsuGame imports the toolbar; neither reads the other while its module loads)
import { OsuGame } from '../../OsuGame';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { OverlayActivation } from '../OverlayActivation';
import { ToolbarBeatmapListingButton } from './ToolbarBeatmapListingButton';
import { TOOLBAR_HEIGHT } from './ToolbarButton';
import { ToolbarChangelogButton } from './ToolbarChangelogButton';
import { ToolbarChatButton } from './ToolbarChatButton';
import { ToolbarClock } from './ToolbarClock';
import { ToolbarHomeButton } from './ToolbarHomeButton';
import { ToolbarMusicButton } from './ToolbarMusicButton';
import { ToolbarNewsButton } from './ToolbarNewsButton';
import { ToolbarNotificationButton } from './ToolbarNotificationButton';
import { ToolbarRankingsButton } from './ToolbarRankingsButton';
import { ToolbarRulesetSelector } from './ToolbarRulesetSelector';
import { ToolbarSettingsButton } from './ToolbarSettingsButton';
import { ToolbarSocialButton } from './ToolbarSocialButton';
import { ToolbarUserButton } from './ToolbarUserButton';
import { ToolbarWikiButton } from './ToolbarWikiButton';

const transition_time = 500;

export class Toolbar extends OverlayContainer implements IKeyBindingHandler<GlobalAction> {
  static readonly HEIGHT = TOOLBAR_HEIGHT;
  static readonly TOOLTIP_HEIGHT = 30;

  readonly keyBindingActionTypes = [GlobalAction];

  /**
   * Whether the user hid this Toolbar with GlobalAction.ToggleToolbar.
   * In this state, automatic toggles should not occur, respecting the user's preference to have no toolbar.
   */
  private hiddenByUser = false;

  onHome: (() => void) | null = null;

  private userButton!: ToolbarUserButton;
  private rulesetSelector!: ToolbarRulesetSelector;

  protected readonly overlayActivationMode = new Bindable<OverlayActivation>(OverlayActivation.All);

  // Toolbar and its components need keyboard input even when hidden.
  override get propagateNonPositionalInputSubTree(): boolean {
    return this.overlayActivationMode.value !== OverlayActivation.Disabled;
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.size = new Vector2(1, Toolbar.HEIGHT);
    this.alwaysPresent = true;
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // this only needed to be set for the initial LoadComplete/Update, so layout completes and gets buttons in a state they can correctly handle keyboard input for hotkeys.
    this.alwaysPresent = false;
  }

  private ruleset!: Bindable<RulesetInfo>;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo').getBoundCopy();
    const osuGame = dependencies.get(OsuGame);

    let background!: ToolbarBackground;
    let interceptor!: HoverInterceptor;

    this.children = [
      background = new ToolbarBackground(),
      new GridContainer().with({
        relativeSizeAxes: Axes.Both,
        columnDimensions: [
          new Dimension(GridSizeMode.AutoSize),
          new Dimension(),
          new Dimension(GridSizeMode.AutoSize),
        ],
        content: [
          [
            new Container().with({
              name: 'Left buttons',
              relativeSizeAxes: Axes.Y,
              autoSizeAxes: Axes.X,
              depth: float_min_value,
              children: [
                new Box().with({
                  colour: OsuColour.gray(Math.fround(0.1)),
                  relativeSizeAxes: Axes.Both,
                }),
                new FillFlowContainer().with({
                  direction: FillDirection.Horizontal,
                  relativeSizeAxes: Axes.Y,
                  autoSizeAxes: Axes.X,
                  children: [
                    new ToolbarSettingsButton(),
                    new ToolbarHomeButton().with({
                      action: () => this.onHome?.(),
                    }),
                  ],
                }),
              ],
            }),
            new Container().with({
              name: 'Ruleset selector',
              relativeSizeAxes: Axes.Both,
              children: [
                new OsuScrollContainer(Direction.Horizontal).with({
                  scrollbarVisible: false,
                  relativeSizeAxes: Axes.Both,
                  masking: false,
                  children: [
                    this.rulesetSelector = new ToolbarRulesetSelector(),
                  ],
                }),
                new Box().with({
                  colour: ColourInfo.gradientHorizontal(OsuColour.gray(Math.fround(0.1)).opacity(0), OsuColour.gray(Math.fround(0.1))),
                  width: 50,
                  relativeSizeAxes: Axes.Y,
                  anchor: Anchor.TopRight,
                  origin: Anchor.TopRight,
                }),
              ],
            }),
            new Container().with({
              name: 'Right buttons',
              relativeSizeAxes: Axes.Y,
              autoSizeAxes: Axes.X,
              anchor: Anchor.TopRight,
              origin: Anchor.TopRight,
              children: [
                new Box().with({
                  colour: OsuColour.gray(Math.fround(0.1)),
                  relativeSizeAxes: Axes.Both,
                }),
                new FillFlowContainer().with({
                  anchor: Anchor.TopRight,
                  origin: Anchor.TopRight,
                  direction: FillDirection.Horizontal,
                  relativeSizeAxes: Axes.Y,
                  autoSizeAxes: Axes.X,
                  children: [
                    new ToolbarNewsButton(),
                    new ToolbarChangelogButton(),
                    new ToolbarWikiButton(),
                    new ToolbarRankingsButton(),
                    new ToolbarBeatmapListingButton(),
                    new ToolbarChatButton(),
                    new ToolbarSocialButton(),
                    new ToolbarMusicButton(),
                    //new ToolbarButton
                    //{
                    //    Icon = FontAwesome.Solid.search
                    //},
                    this.userButton = new ToolbarUserButton(),
                    new ToolbarClock(),
                    new ToolbarNotificationButton(),
                  ],
                }),
              ],
            }),
          ],
        ],
      }),
      interceptor = new HoverInterceptor().with({
        relativeSizeAxes: Axes.Both,
      }),
    ];

    background.showGradient.bindTo(interceptor.receivedHover);

    if (osuGame !== null)
      this.overlayActivationMode.bindTo(osuGame.overlayActivationMode);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.rulesetSelector.current.bindTo(this.ruleset);
  }

  protected override updateState(state: ValueChangedEvent<Visibility>): void {
    const blockShow = this.hiddenByUser || this.overlayActivationMode.value === OverlayActivation.Disabled;

    if (state.newValue === Visibility.Visible && blockShow) {
      this.state.value = Visibility.Hidden;
      return;
    }

    super.updateState(state);
  }

  protected override popIn(): void {
    this.moveToY(0, transition_time, Easing.OutQuint);
    this.fadeIn(transition_time / 4, Easing.OutQuint);
  }

  protected override popOut(): void {
    // (userButton.StateContainer?.Hide(): LoginOverlay isn't ported, so the user button has no state container)
    this.userButton.stateContainer?.hide();

    this.moveToY(-this.drawSize.y, transition_time, Easing.OutQuint);
    this.fadeOut(transition_time, Easing.InQuint);
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (this.overlayActivationMode.value === OverlayActivation.Disabled)
      return false;

    switch (e.action) {
      case GlobalAction.ToggleToolbar:
        this.hiddenByUser = this.state.value === Visibility.Visible; // set before toggling to allow the operation to always succeed.
        this.toggleVisibility();
        return true;
    }

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }
}

// C# float.MinValue
const float_min_value = -3.4028234663852886e38;

/** (Toolbar.ToolbarBackground) */
class ToolbarBackground extends Container {
  readonly showGradient = new BindableBool();

  private readonly gradientBackground: Box;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;
    this.children = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: OsuColour.gray(Math.fround(0.1)),
      }),
      this.gradientBackground = new Box().with({
        relativeSizeAxes: Axes.X,
        anchor: Anchor.BottomLeft,
        alpha: 0,
        height: 80,
        colour: ColourInfo.gradientVertical(
          OsuColour.gray(0).opacity(Math.fround(0.7)), OsuColour.gray(0).opacity(0)),
      }),
    ];
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.showGradient.bindValueChanged(() => this.updateState(), true);
  }

  private updateState(): void {
    if (this.showGradient.value)
      this.gradientBackground.fadeIn(2500, Easing.OutQuint);
    else
      this.gradientBackground.fadeOut(200, Easing.OutQuint);
  }
}

/**
 * Whenever the mouse cursor is within the bounds of the toolbar, we want the background gradient to show, for toolbar button descriptions to
 * be legible. Unfortunately we also need to ensure that the toolbar buttons handle hover, to prevent the possibility of multiple descriptions
 * being shown due to hover events passing through multiple buttons.
 * This drawable is a workaround, that when placed front-most in the toolbar, allows to see whether hover events have been propagated through
 * it without handling them.
 * (Toolbar.HoverInterceptor)
 */
class HoverInterceptor extends Drawable {
  readonly receivedHover = new BindableBool();

  protected override onHover(e: HoverEvent): boolean {
    this.receivedHover.value = true;
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.receivedHover.value = false;
    super.onHoverLost(e);
  }
}
