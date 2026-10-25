// Ported from osu.Game/Graphics/Containers/OsuHoverContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Colour4 } from '@fw/graphics/Colour4';
import type { Drawable } from '@fw/graphics/Drawable';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../OsuColour';
import { HoverSampleSet } from '../userInterface/HoverSampleSet';
import { OsuClickableContainer } from './OsuClickableContainer';

export class OsuHoverContainer extends OsuClickableContainer {
  protected static readonly FADE_DURATION = 500;

  hoverColour: Colour4 | null = null;
  private fallbackHoverColour = Colour4.White;

  idleColour: Colour4 | null = null;
  private fallbackIdleColour = Colour4.White;

  protected get effectTargets(): Iterable<Drawable> {
    return [this.content];
  }

  constructor(sampleSet = HoverSampleSet.Default) {
    super(sampleSet);

    this.enabled.valueChanged.add(e => {
      if (this.hovered) {
        if (e.newValue)
          this.fadeInColour();
        else
          this.fadeOutColour();
      }
    });
  }

  /** C#'s private isHovered (Drawable.isHovered is the input manager's hover state). */
  private hovered = false;

  protected override onHover(e: HoverEvent): boolean {
    if (this.hovered)
      return false;

    this.hovered = true;

    if (!this.enabled.value)
      return false;

    this.fadeInColour();

    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    if (!this.hovered)
      return;

    this.hovered = false;
    this.fadeOutColour();

    super.onHoverLost(e);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colours = dependencies.resolve(OsuColour);
    this.fallbackHoverColour = colours.yellow;
    this.fallbackIdleColour = Colour4.White;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    for (const d of this.effectTargets)
      d.fadeColour(this.idleColour ?? this.fallbackIdleColour);
  }

  // C#'s private fadeIn()/fadeOut() (renamed: Drawable.fadeIn/fadeOut are alpha transforms).
  private fadeInColour(): void {
    for (const d of this.effectTargets)
      d.fadeColour(this.hoverColour ?? this.fallbackHoverColour, OsuHoverContainer.FADE_DURATION, Easing.OutQuint);
  }

  private fadeOutColour(): void {
    for (const d of this.effectTargets)
      d.fadeColour(this.idleColour ?? this.fallbackIdleColour, OsuHoverContainer.FADE_DURATION, Easing.OutQuint);
  }
}
