// Ported from osu.Game/Graphics/UserInterface/LoadingLayer.cs
// Touch input isn't ported, so only scroll events pass through.

import { Colour4 } from '@fw/graphics/Colour4';
import { Box } from '@fw/graphics/shapes/Box';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import { ScrollEvent, type UIEvent } from '@fw/input/events/UIEvents';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { GlobalAction } from '../../input/bindings/GlobalAction';
import { LoadingSpinner } from './LoadingSpinner';

const float_max_value = 3.4028234663852886e38;

/**
 * A layer that will show a loading spinner and completely block input to an area.
 * Also optionally dims target elements.
 * Useful for disabling all elements in a form and showing we are waiting on a response, for instance.
 */
export class LoadingLayer extends LoadingSpinner implements IKeyBindingHandler<GlobalAction> {
  readonly keyBindingActionTypes = [GlobalAction];

  /** Whether to block positional input of components behind the loading layer. Defaults to true. */
  blockPositionalInput = true;

  /** Whether to block all keyboard input. Includes global actions. Defaults to false. */
  blockNonPositionalInput = false;

  /**
   * Construct a new loading spinner.
   * @param dimBackground Whether the full background area should be dimmed while loading.
   * @param withBox Whether the spinner should have a surrounding black box for visibility.
   */
  constructor(dimBackground = false, withBox = true) {
    super(withBox);

    this.relativeSizeAxes = Axes.Both;
    this.size = new Vector2(1);

    this.mainContents.relativeSizeAxes = Axes.None;

    if (dimBackground) {
      this.addInternal(new Box().with({
        depth: float_max_value,
        colour: Colour4.Black,
        alpha: 0.5,
        relativeSizeAxes: Axes.Both,
      }));
    }
  }

  override get handleNonPositionalInput(): boolean {
    return this.blockNonPositionalInput;
  }

  protected override handle(e: UIEvent): boolean {
    if (!this.blockPositionalInput)
      return false;

    // blocking scroll can cause weird behaviour when this layer is used within a ScrollContainer.
    if (e instanceof ScrollEvent)
      return false;

    return true;
  }

  protected override update(): void {
    super.update();

    this.mainContents.size = new Vector2(Math.min(Math.max(Math.fround(Math.min(this.drawWidth, this.drawHeight) * 0.25), 20), 80));
  }

  onPressed(_e: KeyBindingPressEvent<GlobalAction>): boolean {
    return this.blockNonPositionalInput;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }
}
