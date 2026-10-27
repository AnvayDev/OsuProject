// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapCardContentBackground.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool } from '@fw/bindables/Bindable';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { DelayedLoadUnloadWrapper } from '@fw/graphics/containers/DelayedLoadUnloadWrapper';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Anchor, Axes, FillMode } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import type { APIBeatmapSet } from '../../../online/api/requests/responses/APIBeatmapSet';
import { OverlayColourProvider } from '../../../overlays/OverlayColourProvider';
import { OnlineBeatmapSetCover } from '../OnlineBeatmapSetCover';
import { BeatmapCardConstants } from './BeatmapCardConstants';

// C# double.MaxValue
const double_max_value = Number.MAX_VALUE;

export class BeatmapCardContentBackground extends CompositeDrawable {
  readonly dimmed = new BindableBool();

  private readonly background: Box;
  private readonly cover: DelayedLoadUnloadWrapper;

  private colourProvider!: OverlayColourProvider;

  constructor(onlineInfo: APIBeatmapSet, keepLoaded = false) {
    super();

    let background!: Box;
    let cover!: DelayedLoadUnloadWrapper;

    this.internalChildren = [
      background = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      cover = new DelayedLoadUnloadWrapper(() => createCover(onlineInfo), keepLoaded ? 0 : 500, keepLoaded ? double_max_value : 1000).with({
        relativeSizeAxes: Axes.Both,
        colour: Colour4.Transparent,
      }),
    ];

    this.background = background;
    this.cover = cover;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    this.background.colour = this.colourProvider.background2;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.dimmed.bindValueChanged(() => this.updateState(), true);
    this.finishTransforms(true);
  }

  private updateState(): void {
    this.schedule(() => {
      this.background.fadeColour(this.dimmed.value ? this.colourProvider.background4 : this.colourProvider.background2, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);

      const gradient = ColourInfo.gradientHorizontal(Colour4.White.opacity(0), Colour4.White.opacity(0.2));
      this.cover.fadeColour(gradient, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
    });
  }
}

function createCover(onlineInfo: APIBeatmapSet): Drawable {
  return new OnlineBeatmapSetCover(onlineInfo).with({
    relativeSizeAxes: Axes.Both,
    anchor: Anchor.Centre,
    origin: Anchor.Centre,
    fillMode: FillMode.Fill,
  });
}
