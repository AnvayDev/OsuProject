// Ported from osu.Game/Users/Drawables/UpdateableAvatar.cs
// ClickableAvatar isn't ported yet (there are no user profiles), so interactive avatars are plain DrawableAvatars.

import { ModelBackedDrawable } from '@fw/graphics/containers/ModelBackedDrawable';
import type { Drawable } from '@fw/graphics/Drawable';
import { Axes } from '@fw/layout/Enums';
import type { APIUser } from '../../online/api/requests/responses/APIUser';
import { DrawableAvatar } from './DrawableAvatar';

/** An avatar which can update to a new user when needed. */
export class UpdateableAvatar extends ModelBackedDrawable<APIUser> {
  get user(): APIUser | null {
    return this.model;
  }

  set user(value: APIUser | null) {
    this.model = value;
  }

  delayedLoad = true;

  protected override get loadDelay(): number {
    return this.delayedLoad ? 200 : 0;
  }

  private readonly showGuestOnNull: boolean;

  /**
   * Construct a new UpdateableAvatar.
   * user: the initial user to display.
   * showGuestOnNull: whether to show a default guest representation on null user (as opposed to nothing).
   */
  constructor(user: APIUser | null = null, showGuestOnNull = true) {
    // (APIUser.Equals compares user IDs)
    super((a, b) => a === b || (a !== null && b !== null && a.id === b.id));

    this.showGuestOnNull = showGuestOnNull;

    this.user = user;
  }

  protected override createDrawable(user: APIUser | null): Drawable | null {
    if (user === null && !this.showGuestOnNull)
      return null;

    return new DrawableAvatar(user).with({
      relativeSizeAxes: Axes.Both,
    });
  }
}
