// Ported from osu.Game/Overlays/Toolbar/ToolbarClock.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import type { ClickEvent, HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { ToolbarClockDisplayMode } from '../../configuration/ToolbarClockDisplayMode';
import { OsuClickableContainer } from '../../graphics/containers/OsuClickableContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { HoverClickSounds } from '../../graphics/userInterface/HoverClickSounds';
import type { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';
import type { HoverSounds } from '../../graphics/userInterface/HoverSounds';
import { AnalogClockDisplay } from './AnalogClockDisplay';
import { DigitalClockDisplay } from './DigitalClockDisplay';
import { ToolbarButton } from './ToolbarButton';

export class ToolbarClock extends OsuClickableContainer {
  private clockDisplayMode!: Bindable<ToolbarClockDisplayMode>;
  private prefer24HourTime!: Bindable<boolean>;

  private hoverBackground!: Box;
  private flashBackground!: Box;

  private digital!: DigitalClockDisplay;
  private analog!: AnalogClockDisplay;

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Y;
    this.autoSizeAxes = Axes.X;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const config = dependencies.resolve(OsuConfigManager);

    this.clockDisplayMode = config.getBindable<ToolbarClockDisplayMode>(OsuSetting.ToolbarClockDisplayMode);
    this.prefer24HourTime = config.getBindable<boolean>(OsuSetting.Prefer24HourTime);

    this.children = [
      new Container().with({
        relativeSizeAxes: Axes.Y,
        autoSizeAxes: Axes.X,
        padding: new MarginPadding(ToolbarButton.PADDING),
        children: [
          new Container().with({
            relativeSizeAxes: Axes.Both,
            masking: true,
            cornerRadius: 6,
            cornerExponent: 3,
            children: [
              this.hoverBackground = new Box().with({
                relativeSizeAxes: Axes.Both,
                colour: OsuColour.grayByte(80).opacityByte(180),
                blending: BlendingParameters.Additive,
                alpha: 0,
              }),
              this.flashBackground = new Box().with({
                relativeSizeAxes: Axes.Both,
                alpha: 0,
                colour: Colour4.White.opacityByte(100),
                blending: BlendingParameters.Additive,
              }),
            ],
          }),
          new FillFlowContainer().with({
            relativeSizeAxes: Axes.Y,
            autoSizeAxes: Axes.X,
            direction: FillDirection.Horizontal,
            spacing: new Vector2(5),
            padding: new MarginPadding(10),
            children: [
              this.analog = new AnalogClockDisplay().with({
                anchor: Anchor.CentreLeft,
                origin: Anchor.CentreLeft,
              }),
              this.digital = new DigitalClockDisplay().with({
                anchor: Anchor.CentreLeft,
                origin: Anchor.CentreLeft,
              }),
            ],
          }),
        ],
      }),
    ];

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.clockDisplayMode.bindValueChanged(displayMode => {
      const showAnalog = displayMode.newValue === ToolbarClockDisplayMode.Analog || displayMode.newValue === ToolbarClockDisplayMode.Full;
      const showDigital = displayMode.newValue !== ToolbarClockDisplayMode.Analog;
      const showRuntime = displayMode.newValue === ToolbarClockDisplayMode.DigitalWithRuntime || displayMode.newValue === ToolbarClockDisplayMode.Full;

      this.digital.fadeTo(showDigital ? 1 : 0);
      this.digital.showRuntime = showRuntime;

      this.analog.fadeTo(showAnalog ? 1 : 0);
    }, true);

    this.prefer24HourTime.bindValueChanged(prefer24H => this.digital.use24HourDisplay = prefer24H.newValue, true);
  }

  protected override onClick(e: ClickEvent): boolean {
    this.flashBackground.fadeOutFromOne(800, Easing.OutQuint);

    this.cycleDisplayMode();

    return super.onClick(e);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.hoverBackground.fadeIn(200);

    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.hoverBackground.fadeOut(200);

    super.onHoverLost(e);
  }

  protected override createHoverSounds(sampleSet: HoverSampleSet): HoverSounds {
    return new HoverClickSounds(sampleSet);
  }

  private cycleDisplayMode(): void {
    switch (this.clockDisplayMode.value) {
      case ToolbarClockDisplayMode.Analog:
        this.clockDisplayMode.value = ToolbarClockDisplayMode.Full;
        break;

      case ToolbarClockDisplayMode.Digital:
        this.clockDisplayMode.value = ToolbarClockDisplayMode.Analog;
        break;

      case ToolbarClockDisplayMode.DigitalWithRuntime:
        this.clockDisplayMode.value = ToolbarClockDisplayMode.Digital;
        break;

      case ToolbarClockDisplayMode.Full:
        this.clockDisplayMode.value = ToolbarClockDisplayMode.DigitalWithRuntime;
        break;
    }
  }
}
