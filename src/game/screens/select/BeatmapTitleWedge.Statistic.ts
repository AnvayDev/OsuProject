// Ported from osu.Game/Screens/Select/BeatmapTitleWedge.Statistic.cs (+ BeatmapTitleWedge.StatisticPlayCount.cs)
// Tooltips aren't ported yet: tooltipText is stored only.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { Visibility } from '@fw/graphics/containers/VisibilityContainer';
import { Box } from '@fw/graphics/shapes/Box';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuFont } from '../../graphics/OsuFont';
import { OsuIcon } from '../../graphics/OsuIcon';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { LoadingSpinner } from '../../graphics/userInterface/LoadingSpinner';
import { OsuGame } from '../../OsuGame';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

export class Statistic extends CompositeDrawable {
  private readonly icon: IconUsage;
  private readonly background: boolean;
  private readonly leftPadding: number;
  private readonly minSize: number | null;

  private valueText!: OsuSpriteText;
  private loading!: LoadingSpinner;

  private _text: string | null = null;

  get text(): string | null {
    return this._text;
  }

  set text(value: string | null) {
    this._text = value;
    this.scheduler.addOnce(this.updateDisplay);
  }

  tooltipText = '';

  constructor(icon: IconUsage, background = false, leftPadding = 10, minSize: number | null = null) {
    super();

    this.icon = icon;
    this.background = background;
    this.leftPadding = leftPadding;
    this.minSize = minSize;

    this.autoSizeAxes = Axes.Both;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.masking = true;
    this.cornerRadius = 5;
    this.shear = this.background ? OsuGame.SHEAR : Vector2.Zero;

    this.internalChildren = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: Colour4.Black,
        alpha: this.background ? 0.2 : 0,
      }),
      new FillFlowContainer().with({
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        autoSizeAxes: Axes.Both,
        direction: FillDirection.Horizontal,
        margin: MarginPadding.of({ left: this.background ? this.leftPadding : 0, right: this.background ? 10 : 0, vertical: 5 }),
        spacing: new Vector2(4, 0),
        shear: this.background ? OsuGame.SHEAR.neg() : Vector2.Zero,
        children: [
          new SpriteIcon().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            icon: this.icon,
            size: new Vector2(OsuFont.Style.Heading2.size),
            colour: colourProvider.content2,
          }),
          new Container().with({
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            autoSizeAxes: Axes.X,
            height: 20,
            children: [
              this.loading = new LoadingSpinner().with({
                anchor: Anchor.Centre,
                origin: Anchor.Centre,
                size: new Vector2(14),
              }),
              new GridContainer().with({
                anchor: Anchor.CentreLeft,
                origin: Anchor.CentreLeft,
                autoSizeAxes: Axes.Both,
                rowDimensions: [new Dimension(GridSizeMode.AutoSize)],
                columnDimensions: [
                  new Dimension(GridSizeMode.AutoSize, 0, this.minSize ?? 0),
                ],
                content: [
                  [
                    this.valueText = new OsuSpriteText().with({
                      anchor: Anchor.Centre,
                      origin: Anchor.Centre,
                      font: OsuFont.Style.Heading2,
                      colour: colourProvider.content2,
                      margin: MarginPadding.of({ bottom: 2 }),
                      alwaysPresent: true,
                    }),
                  ],
                ],
              }),
            ],
          }),
        ],
      }),
    ];

    this.loading.state.value = Visibility.Visible;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.scheduler.addOnce(this.updateDisplay);
  }

  // (a field so that Scheduler.AddOnce sees the same delegate each time)
  private readonly updateDisplay = (): void => {
    this.loading.state.value = this._text !== null ? Visibility.Hidden : Visibility.Visible;

    if (this._text !== null) {
      this.valueText.text = this._text;
      this.valueText.fadeIn(120, Easing.OutQuint);
    } else
      this.valueText.fadeOut(120, Easing.OutQuint);
  };
}

/** StatisticPlayCount.Data */
export interface PlayCountData {
  readonly total: number;
  readonly user: number;
}

/** BeatmapTitleWedge.StatisticPlayCount (its custom tooltip isn't ported yet). */
export class StatisticPlayCount extends Statistic {
  set value(value: PlayCountData | null) {
    super.text = value === null ? null : value.total < 0 ? '-' : value.total.toLocaleString('en-US');
  }

  constructor(background = false, leftPadding = 10, minSize: number | null = null) {
    super(OsuIcon.Play, background, leftPadding, minSize);
  }
}
