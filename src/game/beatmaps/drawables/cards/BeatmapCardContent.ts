// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapCardContent.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool, type Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import type { OsuScrollContainer } from '../../../graphics/containers/OsuScrollContainer';
import { OverlayColourProvider } from '../../../overlays/OverlayColourProvider';
import { BeatmapCardConstants } from './BeatmapCardConstants';
import { ExpandedContentScrollContainer } from './ExpandedContentScrollContainer';
import { HoverHandlingContainer } from './HoverHandlingContainer';

export class BeatmapCardContent extends CompositeDrawable {
  set mainContent(value: Drawable) {
    this.bodyContent.child = value;
  }

  private createExpandedContent: (() => Drawable) | null = null;

  set expandedContent(value: Drawable | (() => Drawable)) {
    // In the DOM renderer, every hidden difficulty row still owns elements and participates in
    // geometry invalidation. Construct these rows only when the card is first expanded.
    this.createExpandedContent = typeof value === 'function' ? value : null;
    if (typeof value !== 'function')
      this.dropdownScroll.child = value;
    else if (this._expanded.value)
      this.loadExpandedContent();
  }

  private loadExpandedContent(): void {
    if (this.createExpandedContent === null)
      return;

    this.dropdownScroll.child = this.createExpandedContent();
    this.createExpandedContent = null;
  }

  get expanded(): Bindable<boolean> {
    return this._expanded;
  }

  private readonly _expanded = new BindableBool();

  private readonly background: Box;
  /** (C#'s private content) */
  private readonly cardContent: HoverHandlingContainer;
  private readonly bodyContent: Container;
  private readonly dropdownContent: HoverHandlingContainer;
  private readonly dropdownScroll: OsuScrollContainer;
  private readonly borderContainer: Container;

  constructor(height: number) {
    super();

    this.relativeSizeAxes = Axes.X;
    this.height = height;
    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;

    let background!: Box;
    let bodyContent!: Container;
    let dropdownContent!: HoverHandlingContainer;
    let dropdownScroll!: OsuScrollContainer;
    let borderContainer!: Container;

    this.internalChild = this.cardContent = new HoverHandlingContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      cornerRadius: BeatmapCardConstants.CORNER_RADIUS,
      masking: true,
      unhovered: () => this.updateFromHoverChange(),
      children: [
        background = new Box().with({
          relativeSizeAxes: Axes.Both,
        }),
        bodyContent = new Container().with({
          relativeSizeAxes: Axes.X,
          height,
          cornerRadius: BeatmapCardConstants.CORNER_RADIUS,
          masking: true,
        }),
        dropdownContent = new HoverHandlingContainer().with({
          relativeSizeAxes: Axes.X,
          autoSizeAxes: Axes.Y,
          margin: MarginPadding.of({ top: height }),
          alpha: 0,
          hovered: () => {
            this.updateFromHoverChange();
            return true;
          },
          unhovered: () => this.updateFromHoverChange(),
          child: dropdownScroll = new ExpandedContentScrollContainer().with({
            relativeSizeAxes: Axes.X,
            scrollbarVisible: false,
          }),
        }),
        borderContainer = new Container().with({
          relativeSizeAxes: Axes.Both,
          cornerRadius: BeatmapCardConstants.CORNER_RADIUS,
          masking: true,
          borderThickness: 3,
          child: new Box().with({
            relativeSizeAxes: Axes.Both,
            alpha: 0,
            alwaysPresent: true,
          }),
        }),
      ],
    });

    this.background = background;
    this.bodyContent = bodyContent;
    this.dropdownContent = dropdownContent;
    this.dropdownScroll = dropdownScroll;
    this.borderContainer = borderContainer;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.background.colour = colourProvider.background2;
    this.borderContainer.borderColour = colourProvider.highlight1;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this._expanded.bindValueChanged(() => this.updateState(), true);
    this.finishTransforms(true);
  }

  private scheduledExpandedChange: ScheduledDelegate | null = null;

  expandAfterDelay(): void {
    this.queueExpandedStateChange(true, 100);
  }

  cancelExpand(): void {
    this.scheduledExpandedChange?.cancel();
  }

  private updateFromHoverChange(): void {
    this.queueExpandedStateChange(this.cardContent.isHovered || this.dropdownContent.isHovered, 100);
  }

  private queueExpandedStateChange(newState: boolean, delay = 0): void {
    if (this._expanded.disabled)
      return;

    this.scheduledExpandedChange?.cancel();
    this.scheduledExpandedChange = this.scheduler.addDelayed(() => this._expanded.value = newState, delay);
  }

  private updateState(): void {
    // Scale value is intentionally chosen to fit in the spacing of listing displays, as to not overlap horizontally with adjacent cards.
    // This avoids depth issues where a hovered (scaled) card to the right of another card would be beneath the card to the left.
    this.scaleTo(this._expanded.value ? 1.03 : 1, 500, Easing.OutQuint);

    if (this._expanded.value) {
      this.loadExpandedContent();
      this.background.fadeIn(BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
      this.dropdownContent.fadeIn(BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
      this.borderContainer.fadeIn(BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
    } else {
      this.background.fadeOut(BeatmapCardConstants.TRANSITION_DURATION / 3, Easing.OutQuint);
      this.dropdownContent.fadeOut(BeatmapCardConstants.TRANSITION_DURATION / 3, Easing.OutQuint);
      this.borderContainer.fadeOut(BeatmapCardConstants.TRANSITION_DURATION / 3, Easing.OutQuint);
    }

    this.cardContent.tweenEdgeEffectTo(new EdgeEffectParameters({
      type: EdgeEffectType.Shadow,
      offset: new Vector2(0, 2),
      radius: 10,
      colour: Colour4.Black.opacity(this._expanded.value ? 0.3 : 0),
      hollow: true,
    }), BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
  }
}
