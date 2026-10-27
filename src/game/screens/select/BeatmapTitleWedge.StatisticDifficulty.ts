// Ported from osu.Game/Screens/Select/BeatmapTitleWedge.StatisticDifficulty.cs (+ BeatmapTitleWedge.DifficultyStatisticsDisplay.cs)
// The attribute tooltip (BeatmapAttributeTooltip) isn't ported yet. Localisation can't change at runtime, so DifficultyStatisticsDisplay sizes
// its statistics when they are created only.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Dimension, GridContainer, GridSizeMode } from '@fw/graphics/containers/GridContainer';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Circle } from '@fw/graphics/shapes/Circle';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { Anchor, Axes, FillDirection, Invalidation } from '@fw/layout/Enums';
import { LayoutValue } from '@fw/layout/Layout';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { TruncatingSpriteText } from '../../graphics/sprites/TruncatingSpriteText';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

const float_max_value = 3.4028234663852886e38;

/** ToLocalisableString("0.##") */
export const format0_00 = (v: number) => `${Math.round(v * 100) / 100}`;

/** StatisticDifficulty.Data */
export interface StatisticDifficultyData {
  readonly label: string;
  readonly value: number;
  readonly adjustedValue: number;
  readonly maximum: number;
  readonly content?: string | null;
}

export class StatisticDifficulty extends CompositeDrawable {
  private _value: StatisticDifficultyData = { label: '', value: 0, adjustedValue: 0, maximum: 0 };

  get value(): StatisticDifficultyData {
    return this._value;
  }

  set value(value: StatisticDifficultyData) {
    this._value = value;

    if (this.isLoaded)
      this.updateDisplay();
  }

  get labelWidth(): number {
    return this.labelText.drawWidth;
  }

  private readonly bar: Circle;
  private readonly adjustedBar: Circle;
  private readonly labelText: OsuSpriteText;
  private readonly valueText: OsuSpriteText;
  private readonly valueIcon: SpriteIcon;
  private readonly bars: Container;

  get accentColour(): Colour4 {
    return this.bar.colour.averageColour;
  }

  set accentColour(value: Colour4) {
    this.bar.colour = value;
  }

  private colours!: OsuColour;

  constructor() {
    super();

    this.autoSizeAxes = Axes.Y;

    let bars!: Container, bar!: Circle, adjustedBar!: Circle, labelText!: OsuSpriteText, valueText!: OsuSpriteText, valueIcon!: SpriteIcon;

    this.internalChild = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
      children: [
        bars = new Container().with({
          relativeSizeAxes: Axes.X,
          autoSizeAxes: Axes.Y,
          children: [
            new Circle().with({
              relativeSizeAxes: Axes.X,
              height: 2,
              colour: Colour4.Black,
              masking: true,
              cornerRadius: 1,
              depth: float_max_value,
            }),
            bar = new Circle().with({
              relativeSizeAxes: Axes.X,
              width: 0,
              height: 2,
              masking: true,
              cornerRadius: 1,
            }),
            adjustedBar = new Circle().with({
              relativeSizeAxes: Axes.X,
              width: 0,
              height: 2,
              masking: true,
              cornerRadius: 1,
            }),
          ],
        }),
        labelText = new TruncatingSpriteText().with({
          margin: MarginPadding.of({ top: 2 }),
          font: withFont(OsuFont.Style.Caption1, { weight: FontWeight.SemiBold }),
          maxWidth: 85,
        }),
        new FillFlowContainer().with({
          autoSizeAxes: Axes.Both,
          direction: FillDirection.Horizontal,
          children: [
            valueText = new OsuSpriteText().with({
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
              font: OsuFont.Style.Body,
            }),
            valueIcon = new SpriteIcon().with({
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
              margin: MarginPadding.of({
                top: -4,
                left: 2,
              }),
              size: new Vector2(8),
            }),
          ],
        }),
      ],
    });

    this.bars = bars;
    this.bar = bar;
    this.adjustedBar = adjustedBar;
    this.labelText = labelText;
    this.valueText = valueText;
    this.valueIcon = valueIcon;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);
    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.labelText.colour = colourProvider.content2;
    this.valueText.colour = colourProvider.content1;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.updateDisplay();
  }

  private updateDisplay(): void {
    const value = this._value;
    const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

    this.bar.resizeWidthTo(value.maximum === 0 ? 0 : clamp01(value.value / value.maximum), 300, Easing.OutQuint);
    this.adjustedBar.resizeWidthTo(value.maximum === 0 ? 0 : clamp01(value.adjustedValue / value.maximum), 300, Easing.OutQuint);

    this.labelText.text = value.label;
    this.valueText.text = value.content ?? format0_00(value.adjustedValue);

    if (value.value === value.adjustedValue) {
      this.adjustedBar.fadeColour(Colour4.Transparent, 300, Easing.OutQuint);
      this.bar.fadeIn(300, Easing.OutQuint);

      this.valueText.fadeColour(Colour4.White, 300, Easing.OutQuint);
      this.valueIcon.hide();
    } else {
      const difficultyIncrease = value.value < value.adjustedValue;

      if (difficultyIncrease) {
        this.bars.changeChildDepth(this.adjustedBar, 1);
        this.bar.fadeIn(300, Easing.OutQuint);
        this.adjustedBar.fadeColour(ColourInfo.gradientHorizontal(Colour4.Black, this.colours.red1), 300, Easing.OutQuint);

        this.valueText.fadeColour(this.colours.red1, 300, Easing.OutQuint);
        this.valueIcon.show();
        this.valueIcon.colour = this.colours.red1;
        this.valueIcon.icon = FontAwesome.Solid.SortUp;
      } else {
        this.bar.fadeTo(0.5, 300, Easing.OutQuint);
        this.bars.changeChildDepth(this.adjustedBar, -1);
        this.adjustedBar.fadeColour(this.colours.lime1, 300, Easing.OutQuint);

        this.valueText.fadeColour(this.colours.lime1, 300, Easing.OutQuint);
        this.valueIcon.show();
        this.valueIcon.colour = this.colours.lime1;
        this.valueIcon.icon = FontAwesome.Solid.SortDown;
      }
    }
  }
}

export class DifficultyStatisticsDisplay extends CompositeDrawable {
  private readonly autoSize: boolean;
  private readonly statisticsFlow: FillFlowContainer<StatisticDifficulty>;
  private readonly tinyStatisticsGrid: GridContainer;

  private _statistics: readonly StatisticDifficultyData[] = [];

  get statistics(): readonly StatisticDifficultyData[] {
    return this._statistics;
  }

  set statistics(value: readonly StatisticDifficultyData[]) {
    this._statistics = value;

    if (this.isLoaded) {
      this.updateStatistics();
      this.updateTinyStatistics();
    }
  }

  private _accentColour = Colour4.White;

  get accentColour(): Colour4 {
    return this._accentColour;
  }

  set accentColour(value: Colour4) {
    if (this._accentColour.equals(value))
      return;

    this._accentColour = value;

    for (const statistic of this.statisticsFlow.children)
      statistic.accentColour = value;
  }

  private readonly drawSizeLayout = new LayoutValue(Invalidation.DrawSize);

  private colourProvider!: OverlayColourProvider;

  constructor(autoSize = false) {
    super();

    this.autoSize = autoSize;

    if (autoSize)
      this.autoSizeAxes = Axes.Both;
    else
      this.autoSizeAxes = Axes.Y;

    this.internalChildren = [
      this.statisticsFlow = new FillFlowContainer<StatisticDifficulty>().with({
        autoSizeAxes: Axes.Both,
        spacing: new Vector2(8, 0),
        direction: FillDirection.Horizontal,
        alwaysPresent: true,
      }),
      this.tinyStatisticsGrid = new GridContainer().with({
        alpha: 0,
        autoSizeAxes: Axes.Both,
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        columnDimensions: [
          new Dimension(GridSizeMode.AutoSize),
          new Dimension(GridSizeMode.Absolute, 8),
          new Dimension(GridSizeMode.AutoSize),
        ],
      }),
    ];

    this.addLayout(this.drawSizeLayout);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);
    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.updateStatistics();
    this.updateTinyStatistics();
  }

  protected override update(): void {
    super.update();

    if (!this.drawSizeLayout.isValid) {
      this.updateLayout();
      this.drawSizeLayout.validate();
    }
  }

  private displayedTinyStatistics = false;

  private updateLayout(): void {
    const flow = this.statisticsFlow.children;

    if (flow.length === 0)
      return;

    const flowWidth = flow[0].width * flow.length + this.statisticsFlow.spacing.x * (flow.length - 1);
    const tiny = !this.autoSize && this.drawWidth < flowWidth - 20;

    if (this.displayedTinyStatistics !== tiny) {
      if (tiny) {
        this.statisticsFlow.hide();
        // Slow fade hides fill flow layout weirdness.
        this.tinyStatisticsGrid.fadeIn(200, Easing.InQuint);
      } else {
        this.tinyStatisticsGrid.hide();
        // Slow fade hides fill flow layout weirdness.
        this.statisticsFlow.fadeIn(200, Easing.InQuint);
      }

      this.displayedTinyStatistics = tiny;
    }
  }

  // (a field so that Scheduler.AddOnce sees the same delegate each time)
  private readonly updateStatisticsSizingNow = (): void => {
    const flow = this.statisticsFlow.children;

    if (flow.length === 0)
      return;

    const statisticWidth = Math.max(65, ...flow.map(s => s.labelWidth));

    for (const statistic of flow) {
      statistic.width = statisticWidth;
      // Slow fade hides fill flow layout weirdness.
      statistic.fadeIn(200, Easing.InQuint);
    }

    this.drawSizeLayout.invalidate();
  };

  private updateStatisticsSizing(): void {
    this.schedulerAfterChildren.addOnce(this.updateStatisticsSizingNow);
  }

  private readonly updateStatisticsNow = (): void => {
    const flow = this.statisticsFlow.children;
    const statistics = this._statistics;

    if (flow.length === statistics.length && flow.every((s, i) => s.value.label === statistics[i].label)) {
      for (let i = 0; i < statistics.length; i++)
        flow[i].value = statistics[i];
    } else {
      this.statisticsFlow.children = statistics.map(d => new StatisticDifficulty().with({
        alpha: 0,
        accentColour: this._accentColour,
        value: d,
      }));
      this.updateStatisticsSizing();
    }
  };

  private updateStatistics(): void {
    this.scheduler.addOnce(this.updateStatisticsNow);
  }

  private updateTinyStatistics(): void {
    this.tinyStatisticsGrid.rowDimensions = this._statistics.map(() => new Dimension(GridSizeMode.AutoSize));
    this.tinyStatisticsGrid.content = this._statistics.map(s => [
      new OsuSpriteText().with({
        text: s.label,
        font: withFont(OsuFont.Style.Caption2, { weight: FontWeight.SemiBold }),
        colour: this.colourProvider.content2,
      }),
      emptyDrawable(),
      new OsuSpriteText().with({
        font: withFont(OsuFont.Style.Caption2, { weight: FontWeight.SemiBold }),
        text: s.content ?? format0_00(s.value),
        colour: this.colourProvider.content1,
      }),
    ]);
  }
}
