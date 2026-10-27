// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapCardExtraInfoRow.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { FillFlowContainer } from '@fw/graphics/containers/FillFlowContainer';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Anchor, Axes, FillDirection } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import type { APIBeatmapSet } from '../../../online/api/requests/responses/APIBeatmapSet';
import { BeatmapSetOnlineStatusPill } from '../BeatmapSetOnlineStatusPill';
import { DifficultySpectrumDisplay } from '../DifficultySpectrumDisplay';
import { BeatmapCardContent } from './BeatmapCardContent';

export class BeatmapCardExtraInfoRow extends CompositeDrawable {
  private content: BeatmapCardContent | null = null;

  constructor(beatmapSet: APIBeatmapSet) {
    super();

    this.relativeSizeAxes = Axes.X;
    this.autoSizeAxes = Axes.Y;

    this.internalChild = new FillFlowContainer().with({
      relativeSizeAxes: Axes.X,
      autoSizeAxes: Axes.Y,
      direction: FillDirection.Horizontal,
      spacing: new Vector2(3, 0),
      children: [
        new BeatmapSetOnlineStatusPill().with({
          status: beatmapSet.status,
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
          textSize: 13,
        }),
        new DifficultySpectrumDisplay().with({
          beatmapSet,
          anchor: Anchor.CentreLeft,
          origin: Anchor.CentreLeft,
        }),
      ],
    });
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.content = dependencies.get(BeatmapCardContent);

    return r;
  }

  protected override onHover(e: HoverEvent): boolean {
    this.content?.expandAfterDelay();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    if (this.content?.expanded.value === false)
      this.content.cancelExpand();

    super.onHoverLost(e);
  }
}
