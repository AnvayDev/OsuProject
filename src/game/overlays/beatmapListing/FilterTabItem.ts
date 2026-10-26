// Ported from osu.Game/Overlays/BeatmapListing/FilterTabItem.cs
// Takes the label function explicitly (C# reads the enum's [LocalisableDescription]).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import type { Colour4 } from '@fw/graphics/Colour4';
import { TabItem } from '@fw/graphics/userInterface/TabItem';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';
import { HoverSounds } from '../../graphics/userInterface/HoverSounds';
import { OverlayColourProvider } from '../OverlayColourProvider';

export class FilterTabItem<T> extends TabItem<T> {
  protected colourProvider!: OverlayColourProvider;

  protected text!: OsuSpriteText;

  protected selectSample: Sample | null = null;

  private readonly describe: ((value: T) => string) | null;

  constructor(value: T, describe: ((value: T) => string) | null = null) {
    super(value);

    this.describe = describe;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);

    this.autoSizeAxes = Axes.Both;

    this.addRangeInternal([
      this.text = new OsuSpriteText().with({
        font: OsuFont.getFont({ size: 13, weight: FontWeight.Regular }),
        text: this.labelFor(this.value),
      }),
      new HoverSounds(HoverSampleSet.TabSelect),
    ]);

    this.enabled.value = true;

    this.selectSample = await dependencies.resolve(AudioManager).samples.get('UI/tabselect-select');
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.enabled.bindValueChanged(() => this.updateState());
    this.updateState();
    this.finishTransforms(true);
  }

  protected override onHover(e: HoverEvent): boolean {
    super.onHover(e);
    this.updateState();
    return true;
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    super.onHoverLost(e);
    this.updateState();
  }

  protected override onActivated(): void {
    this.updateState();
  }

  protected override onDeactivated(): void {
    this.updateState();
  }

  override onActivatedByUser(): void {
    this.selectSample?.play();
  }

  protected labelFor(value: T): string {
    return this.describe?.(value) ?? String(value);
  }

  protected get colourActive(): Colour4 {
    return this.colourProvider.content1;
  }

  protected get colourNormal(): Colour4 {
    return this.colourProvider.light2;
  }

  protected updateState(): void {
    let colour = this.active.value ? this.colourActive : this.colourNormal;

    if (this.isHovered)
      colour = colour.lighten(0.2);

    this.text.fadeColour(colour, 200, Easing.OutQuint);
    this.text.font = withFont(this.text.font, { weight: this.active.value ? FontWeight.Bold : FontWeight.Regular });
  }
}
