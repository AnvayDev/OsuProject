// Ported from osu.Game/Users/Drawables/DrawableAvatar.cs
// Web: avatars are loaded through the LargeTextureStore's online URL support (there is no OnlineAssetCachingStore).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import { Anchor, Axes, FillMode } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import type { APIUser } from '../../online/api/requests/responses/APIUser';

export class DrawableAvatar extends Sprite {
  private readonly user: APIUser | null;

  /** A simple, non-interactable avatar sprite for the specified user. user: a null value will get a placeholder avatar. */
  constructor(user: APIUser | null = null) {
    super();

    this.user = user;

    this.relativeSizeAxes = Axes.Both;
    this.fillMode = FillMode.Fit;
    this.anchor = Anchor.Centre;
    this.origin = Anchor.Centre;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    const textures = dependencies.resolve(LargeTextureStore);

    if (this.user !== null && this.user.id > 1)
      // TODO: The fallback here should not need to exist. Users should be looked up and populated via UserLookupCache or otherwise
      // in remaining cases where this is required (chat tabs, local leaderboard), at which point this should be removed.
      this.texture = await textures.get(`https://a.ppy.sh/${this.user.id}`);

    this.texture ??= await textures.get('Online/avatar-guest');
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.fadeInFromZero(300, Easing.OutQuint);
  }
}
