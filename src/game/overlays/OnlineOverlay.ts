// Ported from osu.Game/Overlays/OnlineOverlay.cs
// Web: there is no login, so the sign-in gate (OnlineViewContainer when requiresSignIn) isn't used and content is always shown. Context menus
// and popovers aren't ported yet, so OsuContextMenuContainer and PopoverContainer are plain containers.

import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { type IReadOnlyDependencyContainer, DependencyContainer } from '@fw/allocation/DependencyContainer';
import { LoadingLayer } from '../graphics/userInterface/LoadingLayer';
import { FullscreenOverlay } from './FullscreenOverlay';
import type { OverlayColourScheme } from './OverlayColourScheme';
import type { OverlayHeader } from './OverlayHeader';
import { OverlayScrollContainer } from './OverlayScrollContainer';

// C# float.MinValue
const float_min_value = -3.4028234663852886e38;

export abstract class OnlineOverlay<T extends OverlayHeader> extends FullscreenOverlay<T> {
  protected override get content(): Container<Drawable> {
    return this.onlineContent;
  }

  /** [Cached] */
  protected readonly scrollFlow: OverlayScrollContainer;

  protected readonly loading: LoadingLayer;

  private readonly loadingContainer: Container;
  /** (C#'s private content) */
  private readonly onlineContent: Container;

  protected constructor(colourScheme: OverlayColourScheme) {
    super(colourScheme);

    let onlineContent!: Container;
    let loading!: LoadingLayer;

    const mainContent = new Container().with({ relativeSizeAxes: Axes.Both });

    mainContent.addRange([
      this.scrollFlow = new OverlayScrollContainer().with({
        relativeSizeAxes: Axes.Both,
        scrollbarVisible: false,
        child: new Container().with({
          relativeSizeAxes: Axes.X,
          autoSizeAxes: Axes.Y,
          child: new Container().with({
            relativeSizeAxes: Axes.X,
            autoSizeAxes: Axes.Y,
            child: new FillFlowContainer().with({
              relativeSizeAxes: Axes.X,
              autoSizeAxes: Axes.Y,
              direction: FillDirection.Vertical,
              children: [
                (this.header as OverlayHeader).with({ depth: float_min_value }),
                onlineContent = new Container().with({
                  relativeSizeAxes: Axes.X,
                  autoSizeAxes: Axes.Y,
                }),
              ],
            }),
          }),
        }),
      }),
      this.loadingContainer = new Container().with({
        relativeSizeAxes: Axes.Both,
        child: loading = new LoadingLayer(true),
      }),
    ]);

    this.onlineContent = onlineContent;
    this.loading = loading;

    // (base.Content: FullscreenOverlay's content)
    super.content.add(mainContent);
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));
    dependencies.cache(this.scrollFlow);
    return dependencies;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    // Ensure the scroll-to-top button is displayed above the fixed header.
    this.addInternal(this.scrollFlow.button.createProxy());
  }

  protected override updateAfterChildren(): void {
    super.updateAfterChildren();

    // don't block header by applying padding equal to the visible header height
    this.loadingContainer.padding = MarginPadding.of({ top: Math.fround(Math.max(0, this.header.height - this.scrollFlow.current)) });
  }
}
