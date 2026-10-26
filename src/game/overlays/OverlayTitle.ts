// Ported from osu.Game/Overlays/OverlayTitle.cs

import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes, FillDirection, FillMode } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { FontWeight, OsuFont } from '../graphics/OsuFont';
import { OsuSpriteText } from '../graphics/sprites/OsuSpriteText';
import type { INamedOverlayComponent } from './INamedOverlayComponent';

export abstract class OverlayTitle extends CompositeDrawable implements INamedOverlayComponent {
  static readonly ICON_SIZE = 30;

  private readonly titleText: OsuSpriteText;
  private readonly iconContainer: Container;

  private _title = '';

  get title(): string {
    return this._title;
  }

  protected set title(value: string) {
    this.titleText.text = this._title = value;
  }

  private _description = '';

  get description(): string {
    return this._description;
  }

  protected set description(value: string) {
    this._description = value;
  }

  private _icon!: IconUsage;

  get icon(): IconUsage {
    return this._icon;
  }

  protected set icon(value: IconUsage) {
    this.iconContainer.child = new SpriteIcon().with({
      relativeSizeAxes: Axes.Both,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      fillMode: FillMode.Fit,
      icon: this._icon = value,
    });
  }

  protected constructor() {
    super();

    this.autoSizeAxes = Axes.Both;

    this.internalChild = new FillFlowContainer().with({
      autoSizeAxes: Axes.Both,
      spacing: new Vector2(10, 0),
      direction: FillDirection.Horizontal,
      children: [
        this.iconContainer = new Container().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          margin: MarginPadding.of({ horizontal: 5 }), // compensates for osu-web sprites having around 5px of whitespace on each side
          size: new Vector2(OverlayTitle.ICON_SIZE),
        }),
        this.titleText = new OsuSpriteText().with({
          anchor: Anchor.Centre,
          origin: Anchor.Centre,
          font: OsuFont.getFont({ size: 20, weight: FontWeight.Regular }),
          margin: MarginPadding.of({ vertical: 17.5 }), // 15px padding + 2.5px line-height difference compensation
        }),
      ],
    });
  }
}
