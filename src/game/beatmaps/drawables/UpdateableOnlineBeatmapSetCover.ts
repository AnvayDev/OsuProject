// Ported from osu.Game/Beatmaps/Drawables/UpdateableOnlineBeatmapSetCover.cs

import { ModelBackedDrawable } from '@fw/graphics/containers/ModelBackedDrawable';
import { DelayedLoadUnloadWrapper } from '@fw/graphics/containers/DelayedLoadUnloadWrapper';
import type { DelayedLoadWrapper } from '@fw/graphics/containers/DelayedLoadWrapper';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillMode } from '@fw/layout/Enums';
import { OsuColour } from '../../graphics/OsuColour';
import type { APIBeatmapSet } from '../../online/api/requests/responses/APIBeatmapSet';
import { BeatmapSetCoverType, OnlineBeatmapSetCover } from './OnlineBeatmapSetCover';

export class UpdateableOnlineBeatmapSetCover extends ModelBackedDrawable<APIBeatmapSet> {
  private readonly coverType: BeatmapSetCoverType;

  get onlineInfo(): APIBeatmapSet | null {
    return this.model;
  }

  set onlineInfo(value: APIBeatmapSet | null) {
    this.model = value;
  }

  private readonly _loadDelay: number;

  protected override get loadDelay(): number {
    return this._loadDelay;
  }

  private readonly timeBeforeUnload: number;

  protected override get transformDuration(): number {
    return 400;
  }

  constructor(coverType = BeatmapSetCoverType.Cover, timeBeforeLoad = 500, timeBeforeUnload = 1000) {
    super();

    this._loadDelay = timeBeforeLoad;
    this.timeBeforeUnload = timeBeforeUnload;

    this.coverType = coverType;

    this.internalChild = new Box().with({
      relativeSizeAxes: Axes.Both,
      colour: OsuColour.gray(0.2),
    });
  }

  protected override createDelayedLoadWrapper(createContentFunc: () => Drawable, timeBeforeLoad: number): DelayedLoadWrapper {
    return new DelayedLoadUnloadWrapper(createContentFunc, timeBeforeLoad, this.timeBeforeUnload).with({
      relativeSizeAxes: Axes.Both,
    });
  }

  protected override createDrawable(model: APIBeatmapSet | null): Drawable | null {
    if (model === null)
      return null;

    return new OnlineBeatmapSetCover(model, this.coverType).with({
      relativeSizeAxes: Axes.Both,
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      fillMode: FillMode.Fill,
    });
  }
}
