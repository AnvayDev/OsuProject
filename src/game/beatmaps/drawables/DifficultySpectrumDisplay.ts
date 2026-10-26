// Ported from osu.Game/Beatmaps/Drawables/DifficultySpectrumDisplay.cs (over APIBeatmapSet, the IBeatmapSetInfo the listing cards show).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { Circle } from '@fw/graphics/shapes/Circle';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { OsuColour } from '../../graphics/OsuColour';
import { OsuFont } from '../../graphics/OsuFont';
import { OsuSpriteText } from '../../graphics/sprites/OsuSpriteText';
import type { APIBeatmap } from '../../online/api/requests/responses/APIBeatmap';
import type { APIBeatmapSet } from '../../online/api/requests/responses/APIBeatmapSet';
import { RulesetStore } from '../../rulesets/RulesetInfo';
import { createRulesetIcon } from '../../screens/select/PanelBeatmapSet.SpreadDisplay';

const max_difficulties_before_collapsing = 12;

export class DifficultySpectrumDisplay extends CompositeDrawable {
  private _beatmapSet: APIBeatmapSet | null = null;

  get beatmapSet(): APIBeatmapSet | null {
    return this._beatmapSet;
  }

  set beatmapSet(value: APIBeatmapSet | null) {
    this._beatmapSet = value;

    if (this.isLoaded)
      this.updateDisplay();
  }

  private flow!: FillFlowContainer<RulesetDifficultyGroup>;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.autoSizeAxes = Axes.Both;

    this.internalChild = this.flow = new FillFlowContainer<RulesetDifficultyGroup>().with({
      autoSizeAxes: Axes.Both,
      spacing: new Vector2(10, 0),
      direction: FillDirection.Horizontal,
    });

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.updateDisplay();
  }

  private updateDisplay(): void {
    for (const group of this.flow.children)
      group.alpha = 0;

    const beatmapSet = this._beatmapSet;

    if (beatmapSet === null) {
      for (const group of this.flow.children)
        group.beatmaps = [];

      return;
    }

    // matching web: https://github.com/ppy/osu-web/blob/d06d8c5e735eb1f48799b1654b528e9a7afb0a35/resources/assets/lib/beatmapset-panel.tsx#L127
    const collapsed = beatmapSet.beatmaps.length > max_difficulties_before_collapsing;

    const rulesetIds = [...new Set(beatmapSet.beatmaps.map(b => b.rulesetID))].sort((a, b) => a - b);

    for (const rulesetId of rulesetIds) {
      let group = this.flow.children.find(rg => rg.rulesetId === rulesetId);

      if (group === undefined) {
        group = new RulesetDifficultyGroup(rulesetId);
        this.flow.add(group);
        this.flow.setLayoutPosition(group, rulesetId);
      }

      group.alpha = 1;
      group.beatmaps = beatmapSet.beatmaps.filter(b => b.rulesetID === rulesetId);
      group.collapsed = collapsed;
    }
  }
}

/** (DifficultySpectrumDisplay.RulesetDifficultyGroup) */
class RulesetDifficultyGroup extends FillFlowContainer {
  readonly rulesetId: number;

  private _beatmaps: APIBeatmap[] = [];

  set beatmaps(value: APIBeatmap[]) {
    this._beatmaps = [...value].sort((a, b) => a.starRating - b.starRating);
    this.updateGroupDisplay();
  }

  private _collapsed = false;

  get collapsed(): boolean {
    return this._collapsed;
  }

  set collapsed(value: boolean) {
    this._collapsed = value;
    this.updateGroupDisplay();
  }

  private countText: OsuSpriteText | null = null;

  constructor(rulesetId: number) {
    super();

    this.rulesetId = rulesetId;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.autoSizeAxes = Axes.Both;
    this.spacing = new Vector2(1, 0);
    this.direction = FillDirection.Horizontal;

    this.add(createRulesetIcon(RulesetStore.getRuleset(this.rulesetId)).with({
      size: new Vector2(14),
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
    }));

    for (let i = 0; i < max_difficulties_before_collapsing; i++)
      this.add(new DifficultyDot());

    this.add(this.countText = new OsuSpriteText().with({
      font: OsuFont.Style.Caption1,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      padding: MarginPadding.of({ bottom: 1 }),
    }));

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.updateGroupDisplay();
  }

  /** (C#'s private updateDisplay) */
  private updateGroupDisplay(): void {
    // (C# sets beatmaps before load; the display is updated once loaded)
    if (this.countText === null)
      return;

    this.countText.alpha = this._collapsed ? 1 : 0;
    this.countText.text = this._beatmaps.length.toLocaleString('en-US');

    const dots = this.children.filter((c): c is DifficultyDot => c instanceof DifficultyDot);

    for (let i = 0; i < max_difficulties_before_collapsing; i++) {
      const dot = dots[i];

      if (this._collapsed || i >= this._beatmaps.length) {
        dot.alpha = 0;
        continue;
      }

      dot.alpha = 1;
      dot.starDifficulty = this._beatmaps[i].starRating;
    }
  }
}

/** (DifficultySpectrumDisplay.DifficultyDot) */
class DifficultyDot extends Circle {
  private _starDifficulty = 0;

  get starDifficulty(): number {
    return this._starDifficulty;
  }

  set starDifficulty(value: number) {
    this._starDifficulty = value;
    this.updateColour();
  }

  private colours: OsuColour | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);

    this.size = new Vector2(5, 10);
    this.anchor = this.origin = Anchor.Centre;

    this.updateColour();

    return r;
  }

  private updateColour(): void {
    if (this.colours !== null)
      this.colour = this.colours.forStarDifficulty(this._starDifficulty);
  }
}
