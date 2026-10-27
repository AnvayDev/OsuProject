// Ported from osu.Game/Graphics/Containers/OsuClickableContainer.cs
// Tooltips (IHasTooltip) are not ported yet: tooltipText is stored only.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { ClickableContainer } from '@fw/graphics/containers/ClickableContainer';
import { Container } from '@fw/graphics/containers/Container';
import { Axes } from '@fw/layout/Enums';
import type { Vector2 } from '@fw/layout/Vector2';
import { HoverClickSounds } from '../userInterface/HoverClickSounds';
import { HoverSampleSet } from '../userInterface/HoverSampleSet';
import type { HoverSounds } from '../userInterface/HoverSounds';

export class OsuClickableContainer extends ClickableContainer {
  private readonly sampleSet: HoverSampleSet;

  /** C#'s private `content` (the `content` accessor below is Container.Content). */
  private readonly clickableContent = new Container().with({ relativeSizeAxes: Axes.Both });

  private samples: HoverSounds | null = null;

  override receivePositionalInputAt(screenSpacePos: Vector2): boolean {
    // base call is checked for cases when `OsuClickableContainer` has masking applied to it directly (ie. externally in object initialisation).
    return super.receivePositionalInputAt(screenSpacePos)
      // Implementations often apply masking / edge rounding at a content level, so it's imperative to check that as well.
      && this.content.receivePositionalInputAt(screenSpacePos);
  }

  protected override get content(): Container {
    return this.clickableContent;
  }

  protected createHoverSounds(sampleSet: HoverSampleSet): HoverSounds {
    const sounds = new HoverClickSounds(sampleSet);
    sounds.enabled.bindTarget = this.enabled;
    return sounds;
  }

  constructor(sampleSet = HoverSampleSet.Default) {
    super();

    this.sampleSet = sampleSet;
  }

  triggerClickWithSound(): void {
    this.triggerClick();

    // TriggerClick doesn't recursively fire the event so we need to manually do this.
    if (this.samples instanceof HoverClickSounds)
      this.samples.playClickSample();
  }

  tooltipText = '';

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    if (this.autoSizeAxes !== Axes.None) {
      this.clickableContent.relativeSizeAxes = (Axes.Both & ~this.autoSizeAxes);
      this.clickableContent.autoSizeAxes = this.autoSizeAxes;
    }

    this.addRangeInternal([
      this.samples = this.createHoverSounds(this.sampleSet),
      this.clickableContent,
    ]);

    return r;
  }

  protected override clearInternal(_disposeChildren = true): void {
    throw new Error('Clearing internalChildren will cause critical failure. Use clear instead.');
  }
}
