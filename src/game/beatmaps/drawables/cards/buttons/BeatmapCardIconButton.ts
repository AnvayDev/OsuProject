// Ported from osu.Game/Beatmaps/Drawables/Cards/Buttons/BeatmapCardIconButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import { Container } from '@fw/graphics/containers/Container';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import { Box } from '@fw/graphics/shapes/Box';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { OsuClickableContainer } from '../../../../graphics/containers/OsuClickableContainer';
import { OverlayColourProvider } from '../../../../overlays/OverlayColourProvider';
import { BeatmapCardConstants } from '../BeatmapCardConstants';

export abstract class BeatmapCardIconButton extends OsuClickableContainer {
  private _idleColour = Colour4.White;

  get idleColour(): Colour4 {
    return this._idleColour;
  }

  set idleColour(value: Colour4) {
    this._idleColour = value;

    if (this.isLoaded)
      this.updateState();
  }

  private _hoverColour = Colour4.White;

  get hoverColour(): Colour4 {
    return this._hoverColour;
  }

  set hoverColour(value: Colour4) {
    this._hoverColour = value;

    if (this.isLoaded)
      this.updateState();
  }

  protected icon!: SpriteIcon;

  /** (C#'s private content) */
  private buttonContent!: Container;
  private hover!: Container;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.relativeSizeAxes = Axes.Both;

    this.add(this.buttonContent = new Container().with({
      relativeSizeAxes: Axes.Both,
      masking: true,
      scale: new Vector2(0.8),
      origin: Anchor.Centre,
      anchor: Anchor.Centre,
      children: [
        this.hover = new Container().with({
          relativeSizeAxes: Axes.Both,
          cornerRadius: BeatmapCardConstants.CORNER_RADIUS,
          masking: true,
          colour: Colour4.White.opacity(0.1),
          blending: BlendingParameters.Additive,
          child: new Box().with({ relativeSizeAxes: Axes.Both }),
        }),
        this.icon = new SpriteIcon().with({
          origin: Anchor.Centre,
          anchor: Anchor.Centre,
          size: new Vector2(14),
        }),
      ],
    }));

    this.idleColour = colourProvider.light1;
    this.hoverColour = colourProvider.content1;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.enabled.bindValueChanged(() => this.updateState(), true);
    this.finishTransforms(true);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateState();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    super.onHoverLost(e);
    this.updateState();
  }

  private updateState(): void {
    const isHovered = this.isHovered && this.enabled.value;

    this.hover.fadeTo(isHovered ? 1 : 0, 500, Easing.OutQuint);
    this.buttonContent.scaleTo(isHovered ? 0.9 : 0.8, 500, Easing.OutQuint);
    this.icon.fadeColour(isHovered ? this.hoverColour : this.idleColour, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
  }

  protected setLoading(isLoading: boolean): void {
    this.icon.fadeTo(isLoading ? 0.2 : 1, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
    this.enabled.value = !isLoading;
  }
}
