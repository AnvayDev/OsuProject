// Ported from osu.Game/Overlays/Comments/HeaderButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Easing } from '@fw/transforms/Easing';
import { OverlayColourProvider } from '../OverlayColourProvider';

const transition_duration = 200;

export class HeaderButton extends Container {
  protected override get content(): Container<Drawable> {
    return this.buttonContent;
  }

  private readonly background: Box;
  /** (C#'s private content) */
  private readonly buttonContent: Container;

  constructor() {
    super();

    this.autoSizeAxes = Axes.X;
    this.height = 20;
    this.masking = true;
    this.cornerRadius = 3;

    this.addRangeInternal([
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
        alpha: 0,
      }),
      this.buttonContent = new Container().with({
        autoSizeAxes: Axes.Both,
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        margin: MarginPadding.of({ horizontal: 10 }),
      }),
    ]);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.background.colour = dependencies.resolve(OverlayColourProvider).background3;

    return r;
  }

  protected override onHover(e: HoverEvent): boolean {
    this.showBackground();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    super.onHoverLost(e);
    this.hideBackground();
  }

  protected showBackground(): void {
    this.background.fadeIn(transition_duration, Easing.OutQuint);
  }

  protected hideBackground(): void {
    this.background.fadeOut(transition_duration, Easing.OutQuint);
  }
}
