// Ported from osu.Game/Overlays/BeatmapListing/BeatmapListingCardSizeTabControl.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Container } from '@fw/graphics/containers/Container';
import { Box } from '@fw/graphics/shapes/Box';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import type { IconUsage } from '@fw/graphics/sprites/IconUsage';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import { TabFillFlowContainer } from '@fw/graphics/userInterface/TabControl';
import { TabItem } from '@fw/graphics/userInterface/TabItem';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { BeatmapCardSize } from '../../beatmaps/drawables/cards/BeatmapCardSize';
import { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';
import { HoverSounds } from '../../graphics/userInterface/HoverSounds';
import { OsuTabControl } from '../../graphics/userInterface/OsuTabControl';
import { OverlayColourProvider } from '../OverlayColourProvider';

export class BeatmapListingCardSizeTabControl extends OsuTabControl<BeatmapCardSize> {
  constructor() {
    super();

    this.autoSizeAxes = Axes.Both;

    this.items = [BeatmapCardSize.Normal, BeatmapCardSize.Extra];
  }

  protected override createTabFlow(): TabFillFlowContainer<BeatmapCardSize> {
    return new TabFillFlowContainer<BeatmapCardSize>().with({
      autoSizeAxes: Axes.Both,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(10, 0),
    });
  }

  protected override createTabItem(value: BeatmapCardSize): TabItem<BeatmapCardSize> {
    return new CardSizeTabItem(value);
  }
}

const fade_time = 200;

/** (BeatmapListingCardSizeTabControl.TabItem) */
class CardSizeTabItem extends TabItem<BeatmapCardSize> {
  private background!: Box;
  private icon!: SpriteIcon;

  private colourProvider!: OverlayColourProvider;

  private selectSample: Sample | null = null;

  constructor(value: BeatmapCardSize) {
    super(value);
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);

    this.autoSizeAxes = Axes.Both;
    this.masking = true;
    this.cornerRadius = 4;

    this.children = [
      this.background = new Box().with({
        relativeSizeAxes: Axes.Both,
        colour: this.colourProvider.background3,
      }),
      new Container().with({
        autoSizeAxes: Axes.Both,
        padding: MarginPadding.of({
          horizontal: 10,
          vertical: 5,
        }),
        child: this.icon = new SpriteIcon().with({
          size: new Vector2(12),
          icon: getIconForCardSize(this.value),
        }),
      }),
      new HoverSounds(HoverSampleSet.TabSelect),
    ];

    this.selectSample = await dependencies.resolve(AudioManager).samples.get('UI/tabselect-select');
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.updateState();
    this.finishTransforms(true);
  }

  protected override onActivated(): void {
    if (this.isLoaded)
      this.updateState();
  }

  override onActivatedByUser(): void {
    this.selectSample?.play();
  }

  protected override onDeactivated(): void {
    if (this.isLoaded)
      this.updateState();
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateState();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateState();
    super.onHoverLost(e);
  }

  private updateState(): void {
    this.background.fadeTo(this.isHovered || this.active.value ? 1 : 0, fade_time, Easing.OutQuint);
    this.icon.fadeColour(this.active.value && !this.isHovered ? this.colourProvider.light1 : this.colourProvider.content1, fade_time, Easing.OutQuint);
  }
}

function getIconForCardSize(cardSize: BeatmapCardSize): IconUsage {
  switch (cardSize) {
    case BeatmapCardSize.Normal:
      return FontAwesome.Solid.Th;

    case BeatmapCardSize.Extra:
      return FontAwesome.Solid.ThLarge;

    default:
      throw new Error(`Unsupported card size: ${cardSize}`);
  }
}
