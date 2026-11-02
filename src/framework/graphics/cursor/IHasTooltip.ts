// Ported from osu.Framework/Graphics/Cursor/IHasTooltip.cs, IHasCustomTooltip.cs, ITooltipContentProvider.cs and IHasAppearDelay.cs.
// Duck-typed (see Drawable's HandleInputCache): a drawable implements IHasTooltip with a `tooltipText` member and IHasCustomTooltip with
// `getCustomTooltip()` and `tooltipContent`.

import type { Drawable } from '../Drawable';
import type { ITooltip } from './ITooltip';

/** Implementing this interface allows the implementing Drawable to display a tooltip if it is the child of a TooltipContainer. */
export interface IHasTooltip extends Drawable {
  /** Tooltip that shows when hovering the drawable. */
  readonly tooltipText: string | null;
}

/** Implementing this interface allows the implementing Drawable to display a custom tooltip if it is the child of a TooltipContainer. */
export interface IHasCustomTooltip extends Drawable {
  /** The custom tooltip that should be displayed (a shared instance is reused while the type is the same). */
  getCustomTooltip(): ITooltip;
  /** The content to display in the custom tooltip. */
  readonly tooltipContent: unknown;
}

/** (ITooltipContentProvider) */
export type ITooltipContentProvider = IHasTooltip | IHasCustomTooltip;

export function isHasTooltip(d: Drawable): d is IHasTooltip {
  return 'tooltipText' in d;
}

export function isHasCustomTooltip(d: Drawable): d is IHasCustomTooltip {
  return 'getCustomTooltip' in d;
}

/** (IHasAppearDelay) */
export function appearDelayOf(d: Drawable): number | null {
  const delay = (d as { appearDelay?: unknown }).appearDelay;
  return typeof delay === 'number' ? delay : null;
}
