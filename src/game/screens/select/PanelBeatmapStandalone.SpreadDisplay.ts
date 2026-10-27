// Ported from osu.Game/Screens/Select/PanelBeatmapStandalone.SpreadDisplay.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Circle } from '@fw/graphics/shapes/Circle';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { SpriteIcon } from '@fw/graphics/sprites/SpriteIcon';
import type { ClickEvent, HoverEvent, HoverLostEvent, MouseDownEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import { allowGameplayWithRuleset } from '../../beatmaps/BeatmapInfoExtensions';
import type { BeatmapInfo } from '../../beatmaps/BeatmapInfo';
import type { BeatmapSetInfo } from '../../beatmaps/BeatmapSetInfo';
import type { StarDifficulty } from '../../beatmaps/StarDifficulty';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OsuAnimatedButton } from '../../graphics/userInterface/OsuAnimatedButton';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { ISongSelect } from './ISongSelect';

const transition_duration = 200;

/** List<double>.BinarySearch: the index of a match, or the bitwise complement of the insertion index. */
function binarySearch(list: readonly number[], value: number): number {
  let lo = 0;
  let hi = list.length - 1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);

    if (list[mid] === value)
      return mid;

    if (list[mid] < value)
      lo = mid + 1;
    else
      hi = mid - 1;
  }

  return ~lo;
}

export class SpreadDisplay extends OsuAnimatedButton {
  readonly beatmap = new Bindable<BeatmapInfo | null>(null);
  readonly starDifficulty = new Bindable<StarDifficulty>({ stars: 0, maxCombo: 0 });
  readonly selected = new BindableBool();

  protected override get dimColour(): Colour4 {
    return Colour4.White;
  }

  private readonly scopedBeatmapSet = new Bindable<BeatmapSetInfo | null>(null);
  private readonly showConvertedBeatmaps = new Bindable<boolean>(false);

  private songSelect: ISongSelect | null = null;

  private ruleset!: Bindable<RulesetInfo>;

  private colours!: OsuColour;

  private preceding!: FillFlowContainer;
  private _current!: Circle;

  get current(): Circle {
    return this._current;
  }

  private succeeding!: FillFlowContainer;

  private countText!: OsuSpriteText;
  private icon!: SpriteIcon;

  constructor() {
    super();

    this.autoSizeAxes = Axes.X;
    this.relativeSizeAxes = Axes.Y;
    this.content.cornerRadius = 5;

    this.action = () => {
      if (this.beatmap.value !== null)
        this.songSelect?.scopeToBeatmapSet(this.beatmap.value.beatmapSet!);
    };
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.songSelect = dependencies.get(ISongSelect);
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo').getBoundCopy();
    this.colours = dependencies.resolve(OsuColour);
    const configManager = dependencies.resolve(OsuConfigManager);

    this.add(new FillFlowContainer().with({
      autoSizeAxes: Axes.Both,
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(5),
      padding: MarginPadding.of({ horizontal: 5 }),
      children: [
        new FillFlowContainer().with({
          autoSizeAxes: Axes.Both,
          direction: FillDirection.Horizontal,
          spacing: new Vector2(2),
          children: [
            this.preceding = new FillFlowContainer().with({
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
              autoSizeAxes: Axes.Both,
              direction: FillDirection.Horizontal,
              spacing: new Vector2(1),
              alpha: 0.5,
            }),
            this._current = new Circle().with({
              size: new Vector2(7, 12),
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
            }),
            this.succeeding = new FillFlowContainer().with({
              anchor: Anchor.CentreLeft,
              origin: Anchor.CentreLeft,
              autoSizeAxes: Axes.Both,
              direction: FillDirection.Horizontal,
              spacing: new Vector2(1),
              alpha: 0.5,
            }),
          ],
        }),
        this.countText = new OsuSpriteText().with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          font: OsuFont.Style.Caption2,
        }),
        this.icon = new SpriteIcon().with({
          size: new Vector2(12),
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          icon: FontAwesome.Solid.Eye,
          alpha: 0,
        }),
      ],
    }));

    if (this.songSelect !== null)
      this.scopedBeatmapSet.bindTo(this.songSelect.scopedBeatmapSet);

    configManager.bindWith(OsuSetting.ShowConvertedBeatmaps, this.showConvertedBeatmaps);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.beatmap.bindValueChanged(() => this.updateBeatmap());
    this.starDifficulty.bindValueChanged(() => this.updateBeatmap());
    this.showConvertedBeatmaps.bindValueChanged(() => this.updateBeatmap());
    this.scopedBeatmapSet.bindValueChanged(() => this.updateBeatmap(), true);
    this.selected.bindValueChanged(() => this.updateEnabled());
    this.scopedBeatmapSet.bindDisabledChanged(() => this.updateEnabled(), true);
    this.enabled.bindValueChanged(() => this.updateAppearance(), true);
    this.finishTransforms(true);
  }

  private updateBeatmap(): void {
    const beatmap = this.beatmap.value;

    if (beatmap === null || this.scopedBeatmapSet.value !== null) {
      this.fadeOut(transition_duration, Easing.OutQuint);
      return;
    }

    this.preceding.clear();
    this.succeeding.clear();

    const otherStarDifficulties = beatmap.beatmapSet!.beatmaps
      .filter(b => !b.equals(beatmap))
      .filter(b => allowGameplayWithRuleset(b, this.ruleset.value, this.showConvertedBeatmaps.value))
      .map(b => b.starRating)
      .sort((a, b) => a - b);
    this.fadeTo(otherStarDifficulties.length > 0 ? 1 : 0, transition_duration, Easing.OutQuint);

    if (otherStarDifficulties.length === 0)
      return;

    const max_difficulties_total = 11;

    let startIndex: number;
    let endIndex: number;

    if (otherStarDifficulties.length <= max_difficulties_total) {
      startIndex = 0;
      endIndex = otherStarDifficulties.length - 1;
    } else {
      startIndex = binarySearch(otherStarDifficulties, this.starDifficulty.value.stars);
      if (startIndex < 0)
        startIndex = ~startIndex - 1;

      startIndex = Math.min(Math.max(startIndex - Math.trunc(max_difficulties_total / 2), 0), otherStarDifficulties.length - 1);
      endIndex = Math.min(Math.max(startIndex + max_difficulties_total, 0), otherStarDifficulties.length - 1);
    }

    for (let i = startIndex; i <= endIndex; i++) {
      const otherStarDifficulty = otherStarDifficulties[i];
      const target = otherStarDifficulty < this.starDifficulty.value.stars ? this.preceding : this.succeeding;

      const circle = new Circle().with({
        size: new Vector2(5, 10),
        anchor: Anchor.CentreLeft,
        origin: Anchor.CentreLeft,
        colour: this.colours.forStarDifficulty(otherStarDifficulty),
      });
      target.add(circle);
      target.setLayoutPosition(circle, Math.fround(otherStarDifficulty));
    }

    const countNotShown = otherStarDifficulties.length - (this.preceding.children.length + this.succeeding.children.length);
    this.countText.alpha = countNotShown > 0 ? 1 : 0;
    this.countText.text = `+${countNotShown}`;

    if (startIndex > 0) {
      const dots = this.preceding.children;
      for (let i = 0; i < dots.length; ++i)
        dots[i].alpha = Math.fround((1 + 4 * Math.fround((i + 1) / dots.length)) / 5);
    }

    if (endIndex < otherStarDifficulties.length - 1) {
      const dots = this.succeeding.children;
      for (let i = 0; i < dots.length; ++i)
        dots[i].alpha = Math.fround((1 + 4 * Math.fround((dots.length - i) / dots.length)) / 5);
    }
  }

  protected override onMouseDown(e: MouseDownEvent): boolean {
    if (!this.enabled.value)
      return false;

    super.onMouseDown(e);
    return true;
  }

  protected override onClick(e: ClickEvent): boolean {
    if (!this.enabled.value)
      return false;

    return super.onClick(e);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateAppearance();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateAppearance();
    super.onHoverLost(e);
  }

  private updateEnabled(): void {
    this.enabled.value = this.selected.value && !this.scopedBeatmapSet.disabled;
  }

  private updateAppearance(): void {
    const isInteractable = this.enabled.value && this.isHovered;

    this.hoverColour = isInteractable ? Colour4.White.opacity(0.1) : Colour4.Transparent;
    this.preceding.fadeTo(isInteractable ? 1 : 0.5, transition_duration, Easing.OutQuint);
    this.succeeding.fadeTo(isInteractable ? 1 : 0.5, transition_duration, Easing.OutQuint);
    this.icon.fadeTo(isInteractable ? 1 : 0, transition_duration, Easing.OutQuint);
  }
}
