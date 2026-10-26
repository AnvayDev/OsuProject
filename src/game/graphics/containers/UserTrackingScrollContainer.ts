// Ported from osu.Game/Graphics/Containers/UserTrackingScrollContainer.cs
// C# hides ScrollTo/ScrollIntoView/ScrollToEnd with `new`, so the framework's own internal calls don't reset UserScrolling. TS methods are
// virtual, so the user-input paths (onUserScroll, scrollToAbsolutePosition) set the flag after the base call instead of before.

import type { Drawable } from '@fw/graphics/Drawable';
import { Direction } from '@fw/layout/Enums';
import type { Vector2 } from '@fw/layout/Vector2';
import { OsuScrollContainer } from './OsuScrollContainer';

export class UserTrackingScrollContainer<T extends Drawable = Drawable> extends OsuScrollContainer<T> {
  private _userScrolling = false;

  /** Whether the last scroll event was user triggered, directly on the scroll container. */
  get userScrolling(): boolean {
    return this._userScrolling;
  }

  constructor(direction = Direction.Vertical) {
    super(direction);
  }

  protected override onUserScroll(value: number, animated = true, distanceDecay: number | null = null): void {
    super.onUserScroll(value, animated, distanceDecay);
    this._userScrolling = true;
  }

  override scrollIntoView(target: Drawable, animated = true, extraScroll = 0): void {
    this._userScrolling = false;
    super.scrollIntoView(target, animated, extraScroll);
  }

  protected override scrollToAbsolutePosition(screenSpacePosition: Vector2): void {
    super.scrollToAbsolutePosition(screenSpacePosition);
    this._userScrolling = true;
  }

  override scrollTo(value: number | Drawable, animated = true, distanceDecay: number | null = null): void {
    this._userScrolling = false;
    super.scrollTo(value, animated, distanceDecay);
  }

  override scrollToEnd(animated = true, allowDuringDrag = false): void {
    this._userScrolling = false;
    super.scrollToEnd(animated, allowDuringDrag);
  }
}
