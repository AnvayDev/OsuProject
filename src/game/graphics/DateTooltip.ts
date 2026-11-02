// Ported from osu.Game/Graphics/DateTooltip.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { VisibilityContainer } from '@fw/graphics/containers/VisibilityContainer';
import type { ITooltip } from '@fw/graphics/cursor/ITooltip';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import type { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { FontWeight, OsuFont } from './OsuFont';
import { OsuColour } from './OsuColour';
import { OsuSpriteText } from './sprites/OsuSpriteText';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

export class DateTooltip extends VisibilityContainer implements ITooltip {
  private readonly dateText: OsuSpriteText;
  private readonly timeText: OsuSpriteText;
  private readonly background: Box;

  constructor() {
    super();

    this.autoSizeAxes = Axes.Both;
    this.masking = true;
    this.cornerRadius = 5;

    let dateText!: OsuSpriteText;
    let timeText!: OsuSpriteText;

    this.children = [
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      new FillFlowContainer().with({
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Horizontal,
        padding: new MarginPadding(10),
        children: [
          dateText = new OsuSpriteText().with({
            font: OsuFont.getFont({ size: 12, weight: FontWeight.Bold }),
            anchor: Anchor.BottomLeft,
            origin: Anchor.BottomLeft,
          }),
          timeText = new OsuSpriteText().with({
            font: OsuFont.getFont({ size: 12, weight: FontWeight.Regular }),
            anchor: Anchor.BottomLeft,
            origin: Anchor.BottomLeft,
          }),
        ],
      }),
    ];

    this.dateText = dateText;
    this.timeText = timeText;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    this.background.colour = colours.greySeaFoamDarker;
    this.timeText.colour = colours.blueLighter;

    return r;
  }

  protected override popIn(): void {
    this.fadeIn(200, Easing.OutQuint);
  }

  protected override popOut(): void {
    this.fadeOut(200, Easing.OutQuint);
  }

  setContent(content: unknown): void {
    const localDate = content as Date;

    // ({localDate:d MMMM yyyy} and {localDate:HH:mm:ss "UTC"z}: z is the whole-hour UTC offset, signed)
    this.dateText.text = `${localDate.getDate()} ${months[localDate.getMonth()]} ${localDate.getFullYear()} `;

    const offsetHours = Math.trunc(-localDate.getTimezoneOffset() / 60);
    this.timeText.text = `${pad(localDate.getHours())}:${pad(localDate.getMinutes())}:${pad(localDate.getSeconds())} UTC${offsetHours < 0 ? '-' : '+'}${Math.abs(offsetHours)}`;
  }

  move(pos: Vector2): void {
    this.position = pos;
  }
}
