// Ported from osu.Game/Overlays/MarqueeContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Cached } from '@fw/caching/Cached';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Anchor, Axes, FillDirection, Invalidation } from '@fw/layout/Enums';
import { InvalidationSource, LayoutValue } from '@fw/layout/Layout';
import type { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';

const pixels_per_second = 50;

class MarqueeFlow extends FillFlowContainer {
  onRequiredParentSizeInvalidated: () => void = () => {};

  protected override onInvalidate(invalidation: Invalidation, source: InvalidationSource): boolean {
    if ((invalidation & Invalidation.RequiredParentSizeToFit) !== 0)
      this.onRequiredParentSizeInvalidated();

    return super.onInvalidate(invalidation, source);
  }
}

export class MarqueeContainer extends CompositeDrawable {
  /**
   * Whether the marquee should be allowed to scroll the content if it overflows.
   * Note that upon changing the value of this, any existing scrolls will be terminated instantly.
   */
  get allowScrolling(): boolean {
    return this._allowScrolling;
  }

  set allowScrolling(value: boolean) {
    this._allowScrolling = value;
    this.scrollCached.invalidate();
  }

  private _allowScrolling = true;

  /** Time in milliseconds before scrolling begins. */
  initialMoveDelay = 1000;

  /** The Anchor to anchor the content to if it does not overflow. */
  nonOverflowingContentAnchor = Anchor.TopLeft;

  set createContent(value: (() => Drawable) | null) {
    this._createContent = value;
    if (this.isLoaded)
      this.updateContent();
  }

  private _createContent: (() => Drawable) | null = null;

  overflowSpacing = 15;

  private mainContent!: Drawable;
  private fillerContent!: Drawable;
  private flow!: FillFlowContainer;

  private readonly scrollCached = new Cached();
  private readonly drawSizeLayout = new LayoutValue(Invalidation.DrawSize);

  constructor() {
    super();

    this.addLayout(this.drawSizeLayout);

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;
  }

  // (C#'s `new Padding` makes the protected padding public)
  override get padding(): MarginPadding {
    return super.padding;
  }

  override set padding(value: MarginPadding) {
    super.padding = value;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.internalChild = this.flow = new MarqueeFlow().with({
      autoSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
      anchor: this.nonOverflowingContentAnchor,
      origin: this.nonOverflowingContentAnchor,
      spacing: new Vector2(this.overflowSpacing),
      onRequiredParentSizeInvalidated: () => this.scrollCached.invalidate(),
    });

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.updateContent();
  }

  private updateContent(): void {
    this.flow.clear();

    if (this._createContent === null)
      return;

    this.flow.add(this.mainContent = this._createContent());
    this.flow.add(this.fillerContent = this._createContent().with({ alpha: 0 }));
    this.scrollCached.invalidate();
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    if (this.scrollCached.isValid && this.drawSizeLayout.isValid)
      return;

    if (this.mainContent === undefined)
      return;

    const overflowWidth = this.mainContent.drawWidth - this.drawWidth;

    if (overflowWidth > 0 && this._allowScrolling) {
      this.fillerContent.alpha = 1;
      this.flow.anchor = Anchor.TopLeft;
      this.flow.origin = Anchor.TopLeft;

      const targetX = this.mainContent.drawWidth + this.overflowSpacing;

      this.flow.moveToX(0)
        .delay(this.initialMoveDelay)
        .moveToX(-targetX, targetX * 1000 / pixels_per_second)
        .loop();
    } else {
      this.fillerContent.alpha = 0;
      this.flow.clearTransforms();
      this.flow.moveToX(0, 300, Easing.OutQuint);
      this.flow.anchor = this.nonOverflowingContentAnchor;
      this.flow.origin = this.nonOverflowingContentAnchor;
    }

    this.scrollCached.validate();
    this.drawSizeLayout.validate();
  }
}
