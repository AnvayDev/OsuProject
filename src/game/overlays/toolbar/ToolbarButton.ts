// Ported from osu.Game/Overlays/Toolbar/ToolbarButton.cs (ToolbarButton, OpaqueBackground)

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { SpriteText } from '@fw/graphics/sprites/SpriteText';
import type { IKeyBindingHandler, KeyBindingPressEvent, KeyBindingReleaseEvent } from '@fw/input/bindings/KeyBindings';
import type { ClickEvent, HoverEvent, HoverLostEvent, MouseDownEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { Triangles } from '../../graphics/backgrounds/Triangles';
import { ConstrainedIconContainer } from '../../graphics/containers/ConstrainedIconContainer';
import { OsuClickableContainer } from '../../graphics/containers/OsuClickableContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { FontWeight, OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { Hotkey } from '../../graphics/userInterface/Hotkey';
import { HotkeyDisplay } from '../../graphics/userInterface/HotkeyDisplay';
import { GlobalAction } from '../../input/bindings/GlobalAction';

/** Toolbar.HEIGHT (Toolbar imports its buttons, so the constant lives here too). */
export const TOOLBAR_HEIGHT = 40;

export abstract class ToolbarButton extends OsuClickableContainer implements IKeyBindingHandler<GlobalAction> {
  static readonly PADDING = 3;

  readonly keyBindingActionTypes = [GlobalAction];

  protected hotkey: GlobalAction | null = null;

  setIcon(icon: Drawable | IconUsage): void {
    this.iconContainer.icon = icon instanceof Drawable ? icon : new SpriteIcon().with({ icon });
    this.iconContainer.show();
  }

  get tooltipMain(): string {
    return this.tooltip1.text;
  }

  set tooltipMain(value: string) {
    this.tooltip1.text = value;
  }

  get tooltipSub(): string {
    return this.tooltip2.text;
  }

  set tooltipSub(value: string) {
    this.tooltip2.text = value;
  }

  protected get tooltipAnchor(): Anchor {
    return Anchor.TopLeft;
  }

  protected readonly buttonContent: Container;
  protected iconContainer: ConstrainedIconContainer;
  protected hoverBackground: Box;
  private readonly flashBackground: Box;
  private readonly tooltipContainer: FillFlowContainer;
  private readonly tooltip1: SpriteText;
  private readonly tooltip2: SpriteText;
  protected flow: FillFlowContainer;

  protected readonly backgroundContent: Container;

  private readonly subTooltipFlow: FillFlowContainer;

  protected constructor() {
    super();

    this.autoSizeAxes = Axes.X;
    this.relativeSizeAxes = Axes.Y;

    const tooltipLeft = (this.tooltipAnchor & Anchor.x0) !== 0;

    this.children = [
      this.buttonContent = new Container().with({
        width: TOOLBAR_HEIGHT,
        relativeSizeAxes: Axes.Y,
        padding: new MarginPadding(ToolbarButton.PADDING),
        children: [
          this.backgroundContent = new Container().with({
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
          this.flow = new FillFlowContainer().with({
            direction: FillDirection.Horizontal,
            anchor: Anchor.TopCentre,
            origin: Anchor.TopCentre,
            padding: MarginPadding.of({ left: TOOLBAR_HEIGHT / 2, right: TOOLBAR_HEIGHT / 2 }),
            relativeSizeAxes: Axes.Y,
            autoSizeAxes: Axes.X,
            children: [
              this.iconContainer = new ConstrainedIconContainer().with({
                anchor: Anchor.CentreLeft,
                origin: Anchor.CentreLeft,
                size: new Vector2(20),
                alpha: 0,
              }),
            ],
          }),
        ],
      }),
      this.tooltipContainer = new FillFlowContainer().with({
        direction: FillDirection.Vertical,
        relativeSizeAxes: Axes.Both, // stops us being considered in parent's autosize
        anchor: tooltipLeft ? Anchor.BottomLeft : Anchor.BottomRight,
        origin: this.tooltipAnchor,
        position: new Vector2(tooltipLeft ? 5 : -5, 5),
        alpha: 0,
        children: [
          this.tooltip1 = new OsuSpriteText().with({
            anchor: this.tooltipAnchor,
            origin: this.tooltipAnchor,
            shadow: true,
            font: OsuFont.getFont({ size: 22, weight: FontWeight.Bold }),
          }),
          this.subTooltipFlow = new FillFlowContainer().with({
            autoSizeAxes: Axes.Both,
            anchor: this.tooltipAnchor,
            origin: this.tooltipAnchor,
            direction: FillDirection.Horizontal,
            children: [
              this.tooltip2 = new OsuSpriteText().with({ shadow: true }),
            ],
          }),
        ],
      }),
    ];
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    if (this.hotkey !== null) {
      this.subTooltipFlow.add(new HotkeyDisplay().with({
        anchor: Anchor.BottomLeft,
        origin: Anchor.BottomLeft,
        hotkey: new Hotkey(this.hotkey),
        margin: MarginPadding.of({ left: 3 }),
      }));
    }

    return r;
  }

  protected override onMouseDown(_e: MouseDownEvent): boolean {
    return false;
  }

  protected override onClick(e: ClickEvent): boolean {
    this.flashBackground.fadeIn(50).then().fadeOutFromOne(800, Easing.OutQuint);
    this.tooltipContainer.fadeOut(100);
    return super.onClick(e);
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.hoverBackground.fadeIn(300, Easing.OutQuint);
    this.tooltipContainer.fadeIn(200, Easing.OutQuint);

    return true;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.hoverBackground.fadeOut(200, Easing.Out);
    this.tooltipContainer.fadeOut(100, Easing.Out);
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    if (e.action === this.hotkey && !e.repeat) {
      this.triggerClick();
      return true;
    }

    return false;
  }

  onReleased(_e: KeyBindingReleaseEvent<GlobalAction>): void {
  }
}

export class OpaqueBackground extends Container {
  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;

    this.children = [
      new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: OsuColour.grayByte(30),
      }),
      new Triangles().with({
        relativeSizeAxes: Axes.Both,
        colourLight: OsuColour.grayByte(40),
        colourDark: OsuColour.grayByte(20),
      }),
    ];
  }
}
