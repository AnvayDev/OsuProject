// Ported from osu.Game/Overlays/Mods/ModSelectPanel.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { type Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { IFilterable } from '@fw/graphics/containers/SearchContainer';
import { Box } from '@fw/graphics/shapes/Box';
import type { HoverEvent, HoverLostEvent, MouseDownEvent, MouseUpEvent } from '@fw/input/events/UIEvents';
import { MouseButton } from '@fw/input/Key';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Easing } from '@fw/transforms/Easing';
import { ISamplePlaybackDisabler } from '../../audio/ISamplePlaybackDisabler';
import { SessionStatics, Static } from '../../configuration/SessionStatics';
import { OsuClickableContainer } from '../../graphics/containers/OsuClickableContainer';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { TruncatingSpriteText } from '../../graphics/sprites/TruncatingSpriteText';
import type { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';
import { HoverSounds } from '../../graphics/userInterface/HoverSounds';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../OverlayColourProvider';

export abstract class ModSelectPanel extends OsuClickableContainer implements IFilterable {
  abstract get active(): BindableBool;

  accentColour = Colour4.White;

  get title(): string {
    return this.titleText.text;
  }

  set title(value: string) {
    this.titleText.text = value;
  }

  get description(): string {
    return this.descriptionText.text;
  }

  set description(value: string) {
    this.descriptionText.text = value;
  }

  static readonly CORNER_RADIUS = 7;
  static readonly HEIGHT = 42;

  static readonly SAMPLE_PLAYBACK_DELAY = 30;

  protected get idleSwitchWidth(): number {
    return 14;
  }

  protected get expandedSwitchWidth(): number {
    return 30;
  }

  protected get backgroundColour(): Colour4 {
    return this.active.value ? this.accentColour.darken(Math.fround(0.3)) : this.colourProvider.background3;
  }

  protected get foregroundColour(): Colour4 {
    return this.active.value ? this.accentColour : this.colourProvider.background2;
  }

  protected get textColour(): Colour4 {
    return this.active.value ? this.colourProvider.background6 : Colour4.White;
  }

  protected static readonly TRANSITION_DURATION = 150;

  protected readonly background: Box;
  protected readonly switchContainer: Container;
  protected readonly mainContentContainer: Container;
  protected readonly textBackground: Box;
  protected readonly textFlow: FillFlowContainer;

  protected colourProvider!: OverlayColourProvider;

  private readonly titleText: TruncatingSpriteText;
  private readonly descriptionText: TruncatingSpriteText;

  private readonly samplePlaybackDisabled = new BindableBool();
  private sampleOff: Sample | null = null;
  private sampleOn: Sample | null = null;

  private lastPlaybackTime!: Bindable<number | null>;

  protected constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.height = ModSelectPanel.HEIGHT;

    // all below properties are applied to `Content` rather than the `ModPanel` in its entirety
    // to allow external components to set these properties on the panel without affecting
    // its "internal" appearance.
    this.content.masking = true;
    this.content.cornerRadius = ModSelectPanel.CORNER_RADIUS;
    this.content.borderThickness = 2;

    this.shear = OsuGame.SHEAR;

    let background!: Box, switchContainer!: Container, mainContentContainer!: Container, textBackground!: Box, textFlow!: FillFlowContainer;
    let titleText!: TruncatingSpriteText, descriptionText!: TruncatingSpriteText;

    this.children = [
      background = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      switchContainer = new Container().with({
        relativeSizeAxes: Axes.Y,
      }),
      mainContentContainer = new Container().with({
        relativeSizeAxes: Axes.Both,
        child: new Container().with({
          relativeSizeAxes: Axes.Both,
          masking: true,
          cornerRadius: ModSelectPanel.CORNER_RADIUS,
          children: [
            textBackground = new Box().with({
              relativeSizeAxes: Axes.Both,
            }),
            textFlow = new FillFlowContainer().with({
              relativeSizeAxes: Axes.Both,
              padding: MarginPadding.of({
                horizontal: Math.fround(17.5),
                vertical: 4,
              }),
              direction: FillDirection.Vertical,
              children: [
                titleText = new TruncatingSpriteText().with({
                  font: withFont(OsuFont.TorusAlternate, { size: 18, weight: FontWeight.SemiBold }),
                  relativeSizeAxes: Axes.X,
                  shear: OsuGame.SHEAR.neg(),
                  margin: MarginPadding.of({
                    left: Math.fround(-18 * OsuGame.SHEAR.x),
                  }),
                  showTooltip: false, // Tooltip is handled by `IncompatibilityDisplayingModPanel`.
                }),
                descriptionText = new TruncatingSpriteText().with({
                  font: withFont(OsuFont.Default, { size: 12 }),
                  relativeSizeAxes: Axes.X,
                  shear: OsuGame.SHEAR.neg(),
                  showTooltip: false, // Tooltip is handled by `IncompatibilityDisplayingModPanel`.
                }),
              ],
            }),
          ],
        }),
      }),
    ];

    this.background = background;
    this.switchContainer = switchContainer;
    this.mainContentContainer = mainContentContainer;
    this.textBackground = textBackground;
    this.textFlow = textFlow;
    this.titleText = titleText;
    this.descriptionText = descriptionText;

    this.action = () => {
      if (!this.active.value)
        this.select();
      else
        this.deselect();
    };
  }

  /** Performs all actions necessary to select this ModSelectPanel. */
  protected abstract select(): void;

  /** Performs all actions necessary to deselect this ModSelectPanel. */
  protected abstract deselect(): void;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);

    const samples = dependencies.resolve(AudioManager).samples;
    void samples.get('UI/check-on').then(s => this.sampleOn = s);
    void samples.get('UI/check-off').then(s => this.sampleOff = s);

    const samplePlaybackDisabler = dependencies.get(ISamplePlaybackDisabler);
    if (samplePlaybackDisabler !== null)
      this.samplePlaybackDisabled.bindTo(samplePlaybackDisabler.samplePlaybackDisabled);

    this.lastPlaybackTime = dependencies.resolve(SessionStatics).getBindable<number | null>(Static.LastHoverSoundPlaybackTime);

    return r;
  }

  protected override createHoverSounds(sampleSet: HoverSampleSet): HoverSounds {
    return new HoverSounds(sampleSet);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.active.bindValueChanged(() => {
      this.playStateChangeSamples();
      this.updateState();
    });

    this.updateState();
    this.finishTransforms(true);
  }

  private playStateChangeSamples(): void {
    if (this.samplePlaybackDisabled.value)
      return;

    if (!this.isPresent)
      return;

    const lastPlayback = this.lastPlaybackTime.value;
    const enoughTimePassedSinceLastPlayback = lastPlayback === null || this.time.current - lastPlayback >= ModSelectPanel.SAMPLE_PLAYBACK_DELAY;

    if (enoughTimePassedSinceLastPlayback) {
      if (this.active.value)
        this.sampleOn?.play();
      else
        this.sampleOff?.play();

      this.lastPlaybackTime.value = this.time.current;
    }
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateState();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateState();
    super.onHoverLost(e);
  }

  private mouseDown = false;

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (e.button === MouseButton.Left)
      this.mouseDown = true;

    this.updateState();
    return false;
  }

  protected override onMouseUp(e: MouseUpEvent): void {
    this.mouseDown = false;

    this.updateState();
    super.onMouseUp(e);
  }

  protected updateState(): void {
    let targetWidth = this.active.value ? this.expandedSwitchWidth : this.idleSwitchWidth;
    let transitionDuration = ModSelectPanel.TRANSITION_DURATION;

    let backgroundColour = this.backgroundColour;
    let foregroundColour = this.foregroundColour;
    const textColour = this.textColour;

    // Hover affects colour of button background
    if (this.isHovered) {
      backgroundColour = backgroundColour.lighten(Math.fround(0.1));
      foregroundColour = foregroundColour.lighten(Math.fround(0.1));
    }

    // Mouse down adds a halfway tween of the movement
    if (this.mouseDown) {
      targetWidth = Math.fround(this.idleSwitchWidth + (this.expandedSwitchWidth - this.idleSwitchWidth) * 0.5);
      transitionDuration *= 4;
    }

    this.content.transformTo('borderColour', ColourInfo.gradientVertical(backgroundColour, foregroundColour), transitionDuration, Easing.OutQuint);
    this.background.fadeColour(backgroundColour, transitionDuration, Easing.OutQuint);
    this.switchContainer.resizeWidthTo(targetWidth, transitionDuration, Easing.OutQuint);
    this.mainContentContainer.transformTo('padding', MarginPadding.of({
      left: targetWidth,
      right: ModSelectPanel.CORNER_RADIUS,
    }), transitionDuration, Easing.OutQuint);
    this.textBackground.fadeColour(foregroundColour, transitionDuration, Easing.OutQuint);
    this.textFlow.fadeColour(textColour, transitionDuration, Easing.OutQuint);
  }

  // #region IFilterable

  readonly isFilterable = true;

  abstract get filterTerms(): Iterable<string>;

  private _matchingFilter = true;

  get matchingFilter(): boolean {
    return this._matchingFilter;
  }

  set matchingFilter(value: boolean) {
    if (this._matchingFilter === value)
      return;

    this._matchingFilter = value;
    this.fadeTo(value ? 1 : 0);
  }

  set filteringActive(_value: boolean) {
  }

  // #endregion
}
