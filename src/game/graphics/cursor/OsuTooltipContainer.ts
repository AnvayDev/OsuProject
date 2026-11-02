// Ported from osu.Game/Graphics/Cursor/OsuTooltipContainer.cs
// (C# passes GlobalCursorDisplay.MenuCursor; the browser draws the cursor here, see TooltipContainer.)

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { TextFlowContainer } from '@fw/graphics/containers/TextFlowContainer';
import { Tooltip, TooltipContainer } from '@fw/graphics/cursor/TooltipContainer';
import type { ITooltip } from '@fw/graphics/cursor/ITooltip';
import { EdgeEffectParameters, EdgeEffectType } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { valueAt } from '@fw/transforms/Interpolation';
import { FontWeight, OsuFont } from '../OsuFont';
import { OsuColour } from '../OsuColour';

export class OsuTooltipContainer extends TooltipContainer {
  protected override createTooltip(): ITooltip {
    return new OsuTooltip();
  }

  // reduce appear delay if the tooltip is already partly visible.
  protected override get appearDelay(): number {
    return (1 - this.currentTooltip.alpha) * super.appearDelay;
  }
}

const max_width = 500;

export class OsuTooltip extends Tooltip {
  private readonly background: Box;
  private readonly textFlow: TextFlowContainer;
  private instantMovement = true;

  private lastContent: string | null = null;

  override setContent(content: unknown): void {
    const text = String(content ?? '');

    if (text === this.lastContent)
      return;

    this.textFlow.text = text;

    if (this.isPresent) {
      this.autoSizeDuration = 250;
      this.background.flashColour(OsuColour.gray(Math.fround(0.4)), 1000, Easing.OutQuint);
    } else
      this.autoSizeDuration = 0;

    this.lastContent = text;
  }

  constructor() {
    super();

    this.autoSizeEasing = Easing.OutQuint;
    this.cornerRadius = 5;
    this.masking = true;
    this.edgeEffect = new EdgeEffectParameters({
      type: EdgeEffectType.Shadow,
      colour: Colour4.Black.opacity(40),
      radius: 5,
    });

    // (C# assigns Children, replacing the base Tooltip's box and text)
    this.children = [
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
        alpha: Math.fround(0.9),
      }),
      this.textFlow = new TextFlowContainer(f => {
        f.font = OsuFont.getFont({ weight: FontWeight.Regular });
      }).with({
        margin: new MarginPadding(5),
        autoSizeAxes: Axes.Both,
        maximumSize: new Vector2(max_width, Number.POSITIVE_INFINITY),
      }),
    ];
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.background.colour = dependencies.resolve(OsuColour).gray3;

    return r;
  }

  protected override popIn(): void {
    this.instantMovement ||= !this.isPresent;
    this.fadeIn(300, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.delay(150).fadeOut(300, Easing.OutQuint);
  }

  override move(pos: Vector2): void {
    if (this.instantMovement) {
      this.position = pos;
      this.instantMovement = false;
    } else {
      // This method is called every frame so we can do this safely here.
      this.position = valueAt(this.time.elapsed, this.position, pos, 0, 120, Easing.OutQuint);
    }
  }
}
