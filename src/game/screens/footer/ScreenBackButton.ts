// Ported from osu.Game/Screens/Footer/ScreenBackButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { ShearedButton } from '../../graphics/userInterface/ShearedButton';
import { OsuGame } from '../../OsuGame';

export class ScreenBackButton extends ShearedButton {
  static readonly BUTTON_WIDTH = 240;

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    // Ensure clicks in the corner of the screen still trigger the back button.
    // Need to apply more than 1x inflation due to shear.
    const inputRectangle = this.drawRectangle.inflate(MarginPadding.of({
      left: OsuGame.SCREEN_EDGE_MARGIN * 2,
      bottom: OsuGame.SCREEN_EDGE_MARGIN * 2,
    }));

    return inputRectangle.contains(this.toLocalSpace(screenSpacePos));
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.width = ScreenBackButton.BUTTON_WIDTH;

    this.buttonContent.child = new FillFlowContainer().with({
      x: -10,
      relativeSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(20, 0),
      children: [
        new SpriteIcon().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          size: new Vector2(17),
          icon: FontAwesome.Solid.ChevronLeft,
        }),
        new OsuSpriteText().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          font: withFont(OsuFont.TorusAlternate, { size: 17 }),
          text: 'Back',
          useFullGlyphHeight: false,
        }),
      ],
    });

    this.darkerColour = Colour4.fromHex('#DE31AE');
    this.lighterColour = Colour4.fromHex('#FF86DD');
    this.textColour = Colour4.White;

    return r;
  }
}
