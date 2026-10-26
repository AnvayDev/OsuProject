// Ported from osu.Game/Overlays/OverlayHeader.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { OverlayColourProvider } from './OverlayColourProvider';
import type { OverlayTitle } from './OverlayTitle';
import { WaveOverlayContainer } from './WaveOverlayContainer';

// C# float.MaxValue
const float_max_value = 3.4028234663852886e38;

export abstract class OverlayHeader extends Container {
  readonly title: OverlayTitle;

  private _contentSidePadding = 0;

  protected get contentSidePadding(): number {
    return this._contentSidePadding;
  }

  protected set contentSidePadding(value: number) {
    this._contentSidePadding = value;
    this.headerContent.padding = MarginPadding.of({ horizontal: value });
  }

  private readonly titleBackground: Box;
  /** (C#'s private content; renamed: Container.content is the children target) */
  private readonly headerContent: Container;

  protected readonly headerInfo: FillFlowContainer;

  protected constructor() {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    let title!: OverlayTitle;

    this.add(new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
      children: [
        this.headerInfo = new FillFlowContainer().with({
          relativeSizeAxes: Axes.X,
          autoSizeAxes: Axes.Y,
          direction: FillDirection.Vertical,
          depth: -float_max_value,
          children: [
            this.createBackground(),
            new Container().with({
              relativeSizeAxes: Axes.X,
              autoSizeAxes: Axes.Y,
              children: [
                this.titleBackground = new Box().with({
                  relativeSizeAxes: Axes.Both,
                  colour: Colour4.Gray,
                }),
                this.headerContent = new Container().with({
                  relativeSizeAxes: Axes.X,
                  autoSizeAxes: Axes.Y,
                  child: title = this.createTitle().with({
                    anchor: Anchor.CentreLeft,
                    origin: Anchor.CentreLeft,
                  }),
                }),
              ],
            }),
          ],
        }),
        this.createContent(),
      ],
    }));

    this.title = title;

    this.contentSidePadding = WaveOverlayContainer.HORIZONTAL_PADDING;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.titleBackground.colour = dependencies.resolve(OverlayColourProvider).dark5;

    return r;
  }

  protected createContent(): Drawable {
    return emptyDrawable();
  }

  protected createBackground(): Drawable {
    return emptyDrawable();
  }

  protected abstract createTitle(): OverlayTitle;
}
