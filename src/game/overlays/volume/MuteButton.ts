// Ported from osu.Game/Overlays/Volume/MuteButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import type { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { HoverEvent, HoverLostEvent, MouseDownEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuButton } from '../../graphics/userInterface/OsuButton';

export class MuteButton extends OsuButton {
  private readonly _current = new Bindable<boolean>(false);

  get current(): Bindable<boolean> {
    return this._current;
  }

  set current(value: Bindable<boolean>) {
    if (value == null) throw new Error('value may not be null.');

    this._current.unbindBindings();
    this._current.bindTo(value);
  }

  private hoveredBorderColour!: ColourInfo;
  private unhoveredBorderColour!: ColourInfo;
  private border!: CompositeDrawable;

  constructor() {
    super();

    const width = 30;
    const height = 30;

    this.size = new Vector2(width, height);
    this.content.cornerRadius = height / 2;
    this.content.cornerExponent = 2;

    this.action = () => this.current.value = !this.current.value;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);

    this.backgroundColour = colours.gray1;
    this.hoveredBorderColour = ColourInfo.singleColour(colours.pinkLight);
    this.unhoveredBorderColour = ColourInfo.singleColour(colours.gray1);

    let icon!: SpriteIcon;

    this.addRange([
      icon = new SpriteIcon().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
      }),
      this.border = new CircularContainer().with({
        relativeSizeAxes: Axes.Both,
        masking: true,
        borderThickness: 3,
        borderColour: this.unhoveredBorderColour,
        child: new Box().with({
          relativeSizeAxes: Axes.Both,
          alpha: 0,
          alwaysPresent: true,
        }),
      }),
    ]);

    this.current.bindValueChanged(muted => {
      icon.icon = muted.newValue ? FontAwesome.Solid.VolumeMute : FontAwesome.Solid.VolumeUp;
      icon.size = new Vector2(muted.newValue ? 12 : 16);
      icon.margin = MarginPadding.of({ right: muted.newValue ? 2 : 0 });
    }, true);

    return r;
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.border.transformTo('borderColour', this.hoveredBorderColour, 500, Easing.OutQuint);
    return false;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.border.transformTo('borderColour', this.unhoveredBorderColour, 500, Easing.OutQuint);
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    super.onMouseDown(e);

    // Block mouse down to avoid dismissing overlays sitting behind the mute button
    return true;
  }
}
