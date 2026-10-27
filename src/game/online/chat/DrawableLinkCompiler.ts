// Ported from osu.Game/Online/Chat/DrawableLinkCompiler.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { ITextPart } from '@fw/graphics/containers/TextFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
import { SpriteText } from '@fw/graphics/sprites/SpriteText';
import type { Vector2 } from '@fw/layout/Vector2';
import { OsuHoverContainer } from '../../graphics/containers/OsuHoverContainer';
import { OsuColour } from '../../graphics/OsuColour';
import { HoverClickSounds } from '../../graphics/userInterface/HoverClickSounds';
import type { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';
import type { HoverSounds } from '../../graphics/userInterface/HoverSounds';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

class LinkHoverSounds extends HoverClickSounds {
  constructor(sampleSet: HoverSampleSet, private readonly parts: readonly Drawable[]) {
    super(sampleSet);
  }

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    for (const part of this.parts) {
      if (part.receivePositionalInputAt(screenSpacePos))
        return true;
    }

    return false;
  }
}

/** An invisible drawable that brings multiple Drawable pieces together to form a consumable clickable link. */
export class DrawableLinkCompiler extends OsuHoverContainer {
  /** Each word part of a chat link (split for word-wrap support). */
  readonly parts: readonly Drawable[];

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    for (const part of this.parts) {
      if (part.receivePositionalInputAt(screenSpacePos))
        return true;
    }

    return false;
  }

  protected override createHoverSounds(sampleSet: HoverSampleSet): HoverSounds {
    return new LinkHoverSounds(sampleSet, this.parts);
  }

  constructor(part: ITextPart) {
    super();

    this.parts = part.drawables.filter(d => d instanceof SpriteText);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.idleColour ??= dependencies.get(OverlayColourProvider)?.light2 ?? dependencies.resolve(OsuColour).blue;

    return r;
  }

  protected override get effectTargets(): Iterable<Drawable> {
    return this.parts;
  }
}
