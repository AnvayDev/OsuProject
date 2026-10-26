// Ported from osu.Game/Screens/Select/Panel.cs
// The carousel is resolved as the generic Carousel
// (BeatmapCarousel caches itself as both): only activate() is used, and it keeps this module free of an import cycle with the panels.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import { BindableBool } from '@fw/bindables/Bindable';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import type { MenuItem } from '@fw/graphics/userInterface/MenuItem';
import { BlendingParameters, EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { PoolableDrawable } from '@fw/graphics/pooling/PoolableDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import type { ClickEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { EffectControlPoint } from '../../beatmaps/controlPoints/EffectControlPoint';
import type { TimingControlPoint } from '../../beatmaps/controlPoints/TimingControlPoint';
import { Carousel } from '../../graphics/carousel/Carousel';
import { CarouselItem, type ICarouselPanel } from '../../graphics/carousel/CarouselItem';
import { BeatSyncedContainer } from '../../graphics/containers/BeatSyncedContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { HoverSounds } from '../../graphics/userInterface/HoverSounds';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

const active_x_offset = 25;

export class PulsatingBox extends BeatSyncedContainer {
  flashOffset = 0;

  private readonly box: Box;

  constructor() {
    super();

    this.earlyActivationMilliseconds = 40;

    this.internalChildren = [
      this.box = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
    ];
  }

  protected override onNewBeat(beatIndex: number, timingPoint: TimingControlPoint, effectPoint: EffectControlPoint, amplitudes: ChannelAmplitudes): void {
    super.onNewBeat(beatIndex, timingPoint, effectPoint, amplitudes);

    if (beatIndex % Math.pow(2, this.flashOffset) !== 0)
      return;

    let length = timingPoint.beatLength;

    while (length < 250)
      length *= 2;

    this.box
      .fadeTo(0.8, 40, Easing.Out)
      .then()
      .fadeTo(0.4, length, Easing.Out);
  }
}

export abstract class Panel extends PoolableDrawable implements ICarouselPanel {
  static readonly CORNER_RADIUS = 10;

  protected static readonly DURATION = 400;

  protected panelXOffset = 0;

  private backgroundContainer!: Container;
  private iconContainer!: Container;

  private activationFlash!: Drawable;
  private hoverLayer!: Drawable;

  private keyboardSelectionLayer!: Drawable;

  private selectionLayer!: PulsatingBox;

  private _topLevelContent!: Container;

  get topLevelContent(): Container {
    return this._topLevelContent;
  }

  private contentPaddingContainer!: Container;

  private _content!: Container;

  protected get content(): Container {
    return this._content;
  }

  set background(value: Drawable) {
    this.backgroundContainer.child = value;
  }

  set icon(value: Drawable) {
    this.iconContainer.child = value;
  }

  private _accentColour: Colour4 | null = null;

  get accentColour(): Colour4 | null {
    return this._accentColour;
  }

  set accentColour(value: Colour4 | null) {
    if (value === this._accentColour || (value !== null && this._accentColour !== null && value.equals(this._accentColour)))
      return;

    this._accentColour = value;
    this.updateAccentColour();
  }

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    if (this._item === null)
      return this._topLevelContent.receivePositionalInputAt(screenSpacePos);

    let inputRectangle = this._topLevelContent.drawRectangle;

    // Cover the gaps introduced by the spacing between panels so that user mis-aims don't result in no-ops.
    inputRectangle = inputRectangle.inflate(MarginPadding.of({
      top: this._item.carouselInputLenienceAbove,
      bottom: this._item.carouselInputLenienceBelow,
    }));

    return inputRectangle.contains(this._topLevelContent.toLocalSpace(screenSpacePos));
  }

  private carousel: Carousel<unknown> | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.carousel = dependencies.get(Carousel);

    const colourProvider = dependencies.resolve(OverlayColourProvider);
    const colours = dependencies.resolve(OsuColour);

    this.anchor = Anchor.TopRight;
    this.origin = Anchor.TopRight;

    this.relativeSizeAxes = Axes.X;
    this.height = CarouselItem.DEFAULT_HEIGHT;

    this.internalChild = this._topLevelContent = new Container().with({
      masking: true,
      cornerRadius: Panel.CORNER_RADIUS,
      relativeSizeAxes: Axes.Both,
      x: Panel.CORNER_RADIUS,
      children: [
        this.backgroundContainer = new Container().with({
          relativeSizeAxes: Axes.Both,
        }),
        this.iconContainer = new Container().with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          autoSizeAxes: Axes.Both,
        }),
        this.contentPaddingContainer = new Container().with({
          relativeSizeAxes: Axes.Both,
          child: this._content = new Container().with({
            relativeSizeAxes: Axes.Both,
            cornerRadius: Panel.CORNER_RADIUS,
            masking: true,
          }),
        }),
        this.hoverLayer = new Box().with({
          alpha: 0,
          colour: colours.blue.opacity(0.1),
          blending: BlendingParameters.Additive,
          relativeSizeAxes: Axes.Both,
        }),
        this.selectionLayer = new PulsatingBox().with({
          alpha: 0,
          relativeSizeAxes: Axes.Both,
          width: 0.8,
          blending: BlendingParameters.Additive,
          anchor: Anchor.TopRight,
          origin: Anchor.TopRight,
        }),
        this.keyboardSelectionLayer = new Box().with({
          alpha: 0,
          colour: ColourInfo.gradientHorizontal(colourProvider.highlight1.opacity(0.1), colourProvider.highlight1.opacity(0.4)),
          blending: BlendingParameters.Additive,
          relativeSizeAxes: Axes.Both,
        }),
        this.activationFlash = new Box().with({
          colour: Colour4.White.opacity(0.4),
          blending: BlendingParameters.Additive,
          alpha: 0,
          relativeSizeAxes: Axes.Both,
        }),
        new HoverSounds(),
      ],
    });

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.expanded.bindValueChanged(() => {
      this.updateSelectedState();
      this.updateXOffset();
    });

    this.selected.bindValueChanged(() => {
      this.updateSelectedState();
      this.updateXOffset();
    }, true);

    this.keyboardSelected.bindValueChanged(selected => {
      if (selected.newValue) {
        this.keyboardSelectionLayer.fadeIn(80, Easing.Out)
          .then()
          .fadeTo(0.5, 2000, Easing.OutQuint);
      } else
        this.keyboardSelectionLayer.fadeOut(1000, Easing.OutQuint);

      this.updateXOffset();
    }, true);
  }

  protected override prepareForUse(): void {
    super.prepareForUse();

    // Slightly offset the flash animation based on the panel depth.
    // This assumes a minimum depth of -2 (groups).
    this.selectionLayer.flashOffset = -this._item!.depthLayer;

    this.updateAccentColour();

    this.updateXOffset(false);
    this.updateSelectedState(false);

    this.fadeIn(Panel.DURATION, Easing.OutQuint);
  }

  protected override freeAfterUse(): void {
    super.freeAfterUse();

    this.hide();

    // Important to set this to null to handle reuse scenarios correctly, see `item` implementation.
    this._item = null;
  }

  protected override onClick(_e: ClickEvent): boolean {
    // Item may be set to null before actual `freeAfterUse`.
    // This is because Carousel knows to do this ahead of time and let the drawable fade/animate away.
    if (this._item !== null)
      this.carousel?.activate(this._item);

    return true;
  }

  private updateAccentColour(): void {
    const backgroundColour = this._accentColour ?? Colour4.White;

    this.selectionLayer.colour = ColourInfo.gradientHorizontal(backgroundColour.opacity(0), backgroundColour.opacity(0.5));

    this.updateSelectedState(false);
  }

  private updateSelectedState(animated = true): void {
    const selectedOrExpanded = this.expanded.value || this.selected.value;

    const edgeEffectColour = this._accentColour ?? Colour4.fromHex('4EBFFF');

    if (selectedOrExpanded) {
      this._topLevelContent.edgeEffect = new EdgeEffectParameters({
        type: EdgeEffectType.Shadow,
        radius: 2,
        hollow: true,
      });
    } else {
      this._topLevelContent.edgeEffect = new EdgeEffectParameters({
        type: EdgeEffectType.Shadow,
        radius: 4,
        hollow: true,
        offset: new Vector2(0, 1),
      });
    }

    this._topLevelContent.fadeEdgeEffectTo(selectedOrExpanded ? edgeEffectColour.opacity(0.8) : Colour4.Black.opacity(0.2), animated ? Panel.DURATION : 0, Easing.OutQuint);

    if (selectedOrExpanded)
      this.selectionLayer.fadeIn(100, Easing.OutQuint);
    else
      this.selectionLayer.fadeOut(200, Easing.OutQuint);
  }

  /** Whether this is a difficulty panel (C#'s `this is PanelBeatmap || this is PanelBeatmapStandalone`). */
  protected get isBeatmapPanel(): boolean {
    return false;
  }

  private updateXOffset(animated = true): void {
    let x = this.panelXOffset + Panel.CORNER_RADIUS;

    if (!this.expanded.value && !this.selected.value) {
      if (this.isBeatmapPanel)
        x += active_x_offset * 2;
      else
        x += active_x_offset * 4;
    }

    if (!this.keyboardSelected.value)
      x += active_x_offset;

    this._topLevelContent.moveToX(x, animated ? Panel.DURATION : 0, Easing.OutQuint);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.hoverLayer.fadeIn(100, Easing.OutQuint);
    return true;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.hoverLayer.fadeOut(1000, Easing.OutQuint);
    super.onHoverLost(e);
  }

  protected override update(): void {
    super.update();
    this.contentPaddingContainer.padding = this.contentPaddingContainer.padding.with({ left: this.iconContainer.drawWidth });
  }

  /** (IHasContextMenu) */
  abstract get contextMenuItems(): readonly MenuItem[] | null;

  // #region ICarouselPanel

  private _item: CarouselItem | null = null;

  get item(): CarouselItem | null {
    return this._item;
  }

  set item(value: CarouselItem | null) {
    if (this._item === value)
      return;

    // If a new item is set and we already have an item, this is a special case of reuse.
    // To keep things simple, assume that we need to do a full refresh.
    //
    // In the future, this could be more contextual and check whether the associated model has actually changed.
    if (this._item !== null && value !== null) {
      this._item = value;
      this.prepareForUse();
    } else
      this._item = value;
  }

  readonly selected = new BindableBool();
  readonly expanded = new BindableBool();
  readonly keyboardSelected = new BindableBool();

  drawYPosition = 0;

  activated(): void {
    this.activationFlash.fadeOutFromOne(1000, Easing.OutQuint);
  }

  // #endregion
}
