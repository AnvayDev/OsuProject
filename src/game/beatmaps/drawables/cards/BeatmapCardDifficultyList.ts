// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapCardDifficultyList.cs
// A difficulty name links to the beatmap (LinkAction.OpenBeatmap, shown by the beatmap set overlay in C#); without that overlay it opens the
// beatmap's osu-web page.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import { emptyDrawable } from '@fw/graphics/EmptyDrawable';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { LinkFlowContainer } from '../../../graphics/containers/LinkFlowContainer';
import { FontWeight, OsuFont, withFont } from '../../../graphics/OsuFont';
import type { APIBeatmap } from '../../../online/api/requests/responses/APIBeatmap';
import type { APIBeatmapSet } from '../../../online/api/requests/responses/APIBeatmapSet';
import { RulesetStore } from '../../../rulesets/RulesetInfo';
import { createRulesetIcon } from '../../../screens/select/PanelBeatmapSet.SpreadDisplay';
import { StarRatingDisplay, StarRatingDisplaySize } from '../StarRatingDisplay';

export class BeatmapCardDifficultyList extends CompositeDrawable {
  constructor(beatmapSetInfo: APIBeatmapSet) {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    const flow = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Vertical,
      spacing: new Vector2(0, 3),
    });

    this.internalChild = flow;

    let firstGroup = true;

    const rulesetIds = [...new Set(beatmapSetInfo.beatmaps.map(b => b.rulesetID))].sort((a, b) => a - b);

    for (const rulesetId of rulesetIds) {
      if (!firstGroup) {
        flow.add(emptyDrawable().with({
          relativeSizeAxes: Axes.X,
          height: 4,
        }));
      }

      const group = beatmapSetInfo.beatmaps.filter(b => b.rulesetID === rulesetId).sort((a, b) => a.starRating - b.starRating);

      for (const difficulty of group)
        flow.add(new BeatmapCardDifficultyRow(difficulty));

      firstGroup = false;
    }
  }
}

/** (BeatmapCardDifficultyList.BeatmapCardDifficultyRow) */
class BeatmapCardDifficultyRow extends CompositeDrawable {
  private readonly beatmapInfo: APIBeatmap;

  constructor(beatmapInfo: APIBeatmap) {
    super();

    this.beatmapInfo = beatmapInfo;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    const link = new LinkFlowContainer(s => {
      s.font = withFont(OsuFont.Default, { size: 14, weight: FontWeight.SemiBold });
    }).with({
      autoSizeAxes: Axes.Both,
      anchor: Anchor.CentreLeft,
      origin: Anchor.CentreLeft,
      padding: MarginPadding.of({ bottom: 2 }),
    });
    link.addLink(this.beatmapInfo.difficultyName, `https://osu.ppy.sh/beatmaps/${this.beatmapInfo.onlineID}`);

    this.internalChild = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(4, 0),
      children: [
        createRulesetIcon(RulesetStore.getRuleset(this.beatmapInfo.rulesetID)).with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          size: new Vector2(16),
        }),
        new StarRatingDisplay({ stars: this.beatmapInfo.starRating, maxCombo: 0 }, StarRatingDisplaySize.Small).with({
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
        }),
        link,
      ],
    });

    return r;
  }
}
