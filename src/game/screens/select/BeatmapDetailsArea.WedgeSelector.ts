// Ported from osu.Game/Screens/Select/BeatmapDetailsArea.WedgeSelector.cs
// Takes the values and their descriptions explicitly (C# enumerates the enum and reads [LocalisableDescription]). There is one language
// (no localisation), so the language-change refresh runs once after load.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import type { Sample } from '@fw/audio/sample/Sample';
import { Circle } from '@fw/graphics/shapes/Circle';
import { TabControl } from '@fw/graphics/userInterface/TabControl';
import { TabItem } from '@fw/graphics/userInterface/TabItem';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { FontWeight, OsuFont, withFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { HoverSampleSet } from '../../graphics/userInterface/HoverSampleSet';
import { HoverSounds } from '../../graphics/userInterface/HoverSounds';
import { OverlayColourProvider } from '../../overlays/OverlayColourProvider';

export class WedgeSelector<T> extends TabControl<T> {
  private strip!: Circle;

  protected override createTabItem(value: T): TabItem<T> {
    return new WedgeSelectorTabItem(value, this.describe(value));
  }

  protected override get selectedTab(): WedgeSelectorTabItem<T> {
    return super.selectedTab as WedgeSelectorTabItem<T>;
  }

  constructor(spacing: number, private readonly values: readonly T[], private readonly describe: (value: T) => string) {
    super();

    this.tabContainer.spacing = new Vector2(spacing, 0);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const colourProvider = dependencies.resolve(OverlayColourProvider);

    this.addInternal(this.strip = new Circle().with({
      anchor: Anchor.BottomLeft,
      origin: Anchor.BottomLeft,
      height: 2,
      colour: colourProvider.highlight1,
    }));

    for (const type of this.values)
      this.addItem(type);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.current.bindValueChanged(() => this.updateDisplay());

    this.scheduleAfterChildren(() => {
      this.updateDisplay();
      this.finishTransforms(true);
    });
  }

  private updateDisplay(): void {
    this.strip.moveToX(this.selectedTab.text.toSpaceOfOtherDrawable(Vector2.Zero, this).x, 300, Easing.OutQuint);
    this.strip.resizeWidthTo(this.selectedTab.text.width, 0, Easing.OutQuint);
  }
}

/** (WedgeSelector.TabItem) */
export class WedgeSelectorTabItem<T> extends TabItem<T> {
  private selectSample: Sample | null = null;

  private colourProvider!: OverlayColourProvider;

  readonly text: OsuSpriteText;

  constructor(value: T, description: string) {
    super(value);

    this.autoSizeAxes = Axes.Both;

    this.children = [
      this.text = new OsuSpriteText().with({
        anchor: Anchor.Centre,
        origin: Anchor.Centre,
        text: description,
        font: OsuFont.Style.Body,
      }),
      new HoverSounds(HoverSampleSet.TabSelect),
    ];
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    void dependencies.resolve(AudioManager).samples.get('UI/tabselect-select').then(s => this.selectSample = s);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.updateDisplay();
  }

  override onActivatedByUser(): void {
    this.selectSample?.play();
  }

  protected override onActivated(): void {
    this.updateDisplay();
  }

  protected override onDeactivated(): void {
    this.updateDisplay();
  }

  protected override onHover(_e: HoverEvent): boolean {
    this.updateDisplay();
    return true;
  }

  protected override onHoverLost(_e: HoverLostEvent): void {
    this.updateDisplay();
  }

  private updateDisplay(): void {
    if (this.active.value || this.isHovered)
      this.text.fadeColour(this.colourProvider.content1, 300, Easing.OutQuint);
    else
      this.text.fadeColour(this.colourProvider.content2, 300, Easing.OutQuint);

    this.text.font = withFont(this.text.font, { weight: this.active.value ? FontWeight.SemiBold : FontWeight.Regular });
  }
}
