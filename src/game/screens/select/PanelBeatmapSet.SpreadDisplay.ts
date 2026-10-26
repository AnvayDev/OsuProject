// Ported from osu.Game/Screens/Select/PanelBeatmapSet.SpreadDisplay.cs
// Ruleset icons: rulesets other than osu! aren't instantiable here, so their CreateIcon() is the matching OsuIcon (as each ruleset's CreateIcon does).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { Drawable } from '@fw/graphics/Drawable';
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
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuFont } from '../../graphics/OsuFont';
import { OsuIcon } from '../../graphics/OsuIcon';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import { OsuAnimatedButton } from '../../graphics/userInterface/OsuAnimatedButton';
import type { RulesetInfo } from '../../rulesets/RulesetInfo';
import { ISongSelect } from './ISongSelect';

const transition_duration = 200;

/** Ruleset.CreateIcon() for the official rulesets (FontAwesome.Regular.QuestionCircle when there is no ruleset). */
export function createRulesetIcon(ruleset: RulesetInfo | null): Drawable {
  switch (ruleset?.shortName) {
    case 'osu': return new SpriteIcon().with({ icon: OsuIcon.RulesetOsu });
    case 'taiko': return new SpriteIcon().with({ icon: OsuIcon.RulesetTaiko });
    case 'fruits': return new SpriteIcon().with({ icon: OsuIcon.RulesetCatch });
    case 'mania': return new SpriteIcon().with({ icon: OsuIcon.RulesetMania });
    default: return new SpriteIcon().with({ icon: FontAwesome.Regular.QuestionCircle });
  }
}

export class SpreadDisplay extends OsuAnimatedButton {
  readonly beatmapSet = new Bindable<BeatmapSetInfo | null>(null);

  readonly visibleBeatmaps = new Bindable<Set<BeatmapInfo> | null>(null);

  readonly expanded = new BindableBool();

  protected override get dimColour(): Colour4 {
    return Colour4.White;
  }

  private readonly scopedBeatmapSet = new Bindable<BeatmapSetInfo | null>(null);
  private readonly showConvertedBeatmaps = new Bindable<boolean>(false);

  private songSelect: ISongSelect | null = null;

  private ruleset!: Bindable<RulesetInfo>;

  private colours!: OsuColour;

  private flow!: FillFlowContainer;
  private icon!: SpriteIcon;

  constructor() {
    super();

    this.autoSizeAxes = Axes.X;
    this.height = 14;
    this.content.cornerRadius = 5;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.songSelect = dependencies.get(ISongSelect);
    this.ruleset = dependencies.resolve(Bindable<RulesetInfo>, 'RulesetInfo');
    this.colours = dependencies.resolve(OsuColour);
    const configManager = dependencies.resolve(OsuConfigManager);

    this.add(new FillFlowContainer().with({
      autoSizeAxes: Axes.X,
      relativeSizeAxes: Axes.Y,
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(5),
      padding: MarginPadding.of({ horizontal: 5 }),
      children: [
        this.flow = new FillFlowContainer().with({
          autoSizeAxes: Axes.X,
          relativeSizeAxes: Axes.Y,
          direction: FillDirection.Horizontal,
          spacing: new Vector2(1),
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

    this.beatmapSet.bindValueChanged(() => this.updateBeatmapSet());
    this.visibleBeatmaps.bindValueChanged(() => this.updateBeatmapSet());
    this.showConvertedBeatmaps.bindValueChanged(() => this.updateBeatmapSet(), true);
    this.expanded.bindValueChanged(() => this.updateEnabled());
    this.scopedBeatmapSet.bindValueChanged(() => this.updateEnabled(), true);
    this.scopedBeatmapSet.bindDisabledChanged(() => this.updateEnabled(), true);
    this.enabled.bindValueChanged(() => this.updateAppearance(), true);
    this.finishTransforms(true);
  }

  private updateBeatmapSet(): void {
    const beatmapSet = this.beatmapSet.value;

    if (beatmapSet === null) {
      this.fadeOut(transition_duration, Easing.OutQuint);
      return;
    }

    this.flow.clear();

    const max_difficulties_before_collapsing = 12;

    const beatmaps = beatmapSet.beatmaps
      .filter(b => allowGameplayWithRuleset(b, this.ruleset.value, this.showConvertedBeatmaps.value));
    this.fadeTo(beatmaps.length > 0 ? 1 : 0, transition_duration, Easing.OutQuint);

    if (beatmaps.length === 0)
      return;

    const visibleBeatmaps = this.visibleBeatmaps.value;
    const showVisible = visibleBeatmaps === null || visibleBeatmaps.size <= max_difficulties_before_collapsing;
    const showHidden = beatmaps.length <= max_difficulties_before_collapsing;

    // (GroupBy keeps first-appearance order; OrderBy(Key) is stable.)
    const beatmapsByRuleset = new Map<number, BeatmapInfo[]>();
    for (const b of beatmaps) {
      const group = beatmapsByRuleset.get(b.ruleset.onlineID);
      if (group === undefined) beatmapsByRuleset.set(b.ruleset.onlineID, [b]);
      else group.push(b);
    }

    for (const [, rulesetGrouping] of [...beatmapsByRuleset].sort((a, b) => a[0] - b[0])) {
      const rulesetIcon = createRulesetIcon(rulesetGrouping[0].ruleset);
      rulesetIcon.size = new Vector2(14);
      rulesetIcon.anchor = rulesetIcon.origin = Anchor.CentreLeft;
      rulesetIcon.margin = MarginPadding.of({ left: this.flow.children.length > 0 ? 9 : 0 });
      this.flow.add(rulesetIcon);

      let overflowVisible = 0;
      let overflowHidden = 0;
      let lastBeatmapVisible: boolean | null = null;

      for (const beatmap of [...rulesetGrouping].sort((a, b) => a.starRating - b.starRating)) {
        const visible = visibleBeatmaps?.has(beatmap) !== false;

        if ((visible && showVisible) || (!visible && showHidden)) {
          const circle = new Circle().with({
            size: visible ? new Vector2(7, 12) : new Vector2(5, 10),
            alpha: visible ? 1 : 0.5,
            anchor: Anchor.CentreLeft,
            origin: Anchor.CentreLeft,
            colour: this.colours.forStarDifficulty(beatmap.starRating),
            margin: MarginPadding.of({ left: lastBeatmapVisible !== null && lastBeatmapVisible !== visible ? 1 : 0 }),
          });
          this.flow.add(circle);

          lastBeatmapVisible = visible;
        } else {
          if (visible)
            overflowVisible++;
          else
            overflowHidden++;
        }
      }

      if (overflowVisible > 0) {
        this.flow.add(new OsuSpriteText().with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          font: OsuFont.Style.Caption2,
          text: `${overflowVisible}`,
        }));
      }

      if (overflowHidden > 0) {
        this.flow.add(new OsuSpriteText().with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          font: OsuFont.Style.Caption2,
          text: `+${overflowHidden}`,
          alpha: 0.7,
        }));
      }
    }

    this.action = () => this.songSelect?.scopeToBeatmapSet(beatmapSet);
    this.updateEnabled();
  }

  private updateEnabled(): void {
    this.enabled.value = this.expanded.value && !this.scopedBeatmapSet.disabled && this.scopedBeatmapSet.value === null;
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

    // this is a crude workaround with an issue with `OsuAnimatedButton` that isn't easily fixable.
    // the issue is that when wanting to turn off the hover layer upon click, `HoverColour` can be set to a transparent colour,
    // *but* this has to happen *before* `base.OnClick()`.
    // this is because `base.OnClick()` uses `FlashColour()` to flash the button on click,
    // but that `FlashColour()` call implicitly copies `hoverColour` *at the point of call* into the transform that ends the flash.
    this.updateAppearance(false);
    return super.onClick(e);
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateAppearance();

    if (!this.enabled.value)
      return false;

    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateAppearance();

    if (!this.enabled.value)
      return;

    super.onHoverLost(e);
  }

  private updateAppearance(isInteractable: boolean | null = null): void {
    isInteractable ??= this.enabled.value && this.isHovered;

    this.hoverColour = isInteractable ? Colour4.White.opacity(0.1) : Colour4.Transparent;
    this.icon.fadeTo(isInteractable ? 1 : 0, transition_duration, Easing.OutQuint);
  }
}
