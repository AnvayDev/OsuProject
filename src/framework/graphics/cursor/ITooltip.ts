// Ported from osu.Framework/Graphics/Cursor/ITooltip.cs

import type { Vector2 } from '../../layout/Vector2';
import type { Drawable } from '../Drawable';

/** A tooltip that can be used in conjunction with a TooltipContainer and/or IHasCustomTooltip implementation. */
export interface ITooltip extends Drawable {
  /** Set new content for this tooltip. */
  setContent(content: unknown): void;

  /** Moves the tooltip to the given position. May be used for custom animations. */
  move(pos: Vector2): void;

  show(): void;
  hide(): void;
}
