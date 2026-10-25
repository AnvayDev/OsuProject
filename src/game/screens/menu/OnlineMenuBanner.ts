// Ported from osu.Game/Screens/Menu/OnlineMenuBanner.cs (offline: the visibility container and its empty image container only)
// There is no API to fetch menu-content.json from, so the banner never has images (as with FetchOnlineContent = false): it stays an empty,
// zero-sized but present child of the bottom elements flow.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Container } from '@fw/graphics/containers/Container';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';

const transition_duration = 500;

export class OnlineMenuBanner extends VisibilityContainer {
  /** C#'s private `content` (renamed: Container.content is the Content accessor). */
  private images!: Container;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.autoSizeAxes = Axes.Both;
    this.autoSizeDuration = transition_duration;
    this.autoSizeEasing = Easing.OutQuint;

    this.internalChild = this.images = new Container().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      autoSizeAxes: Axes.Both,
    });

    return r;
  }

  protected override popIn(): void {
    this.images.fadeInFromZero(transition_duration, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.images.fadeOut(transition_duration, Easing.OutQuint);
  }
}
