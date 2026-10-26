// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapCardThumbnail.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { BindableBool } from '@fw/bindables/Bindable';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import { Box } from '@fw/graphics/shapes/Box';
import { CircularProgress } from '@fw/graphics/userInterface/CircularProgress';
import { Anchor, Axes } from '@fw/layout/Enums';
import type { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Easing } from '@fw/transforms/Easing';
import type { APIBeatmapSet } from '../../../online/api/requests/responses/APIBeatmapSet';
import { OverlayColourProvider } from '../../../overlays/OverlayColourProvider';
import { BeatmapSetCoverType } from '../OnlineBeatmapSetCover';
import { UpdateableOnlineBeatmapSetCover } from '../UpdateableOnlineBeatmapSetCover';
import { BeatmapCardConstants } from './BeatmapCardConstants';
import { PlayButton } from './buttons/PlayButton';

// C# double.MaxValue
const double_max_value = Number.MAX_VALUE;

/** BeatmapCardNormal.HEIGHT (not imported: the card imports this thumbnail). */
const card_normal_height = 80;

export class BeatmapCardThumbnail extends Container {
  readonly dimmed = new BindableBool();

  /** (new Padding: the foreground's) */
  override get padding(): MarginPadding {
    return this.foreground.padding;
  }

  override set padding(value: MarginPadding) {
    this.foreground.padding = value;
  }

  private readonly background: Box;
  private readonly foreground: Container;
  private readonly playButton: PlayButton;
  private readonly progress: CircularProgress;
  /** (C#'s private content) */
  private readonly thumbnailContent: Container;

  protected override get content(): Container<Drawable> {
    return this.thumbnailContent;
  }

  private colourProvider!: OverlayColourProvider;

  constructor(beatmapSetInfo: APIBeatmapSet, onlineInfo: APIBeatmapSet, keepLoaded = false) {
    super();

    let background!: Box;
    let foreground!: Container;
    let playButton!: PlayButton;
    let progress!: CircularProgress;
    let thumbnailContent!: Container;

    this.internalChildren = [
      new UpdateableOnlineBeatmapSetCover(BeatmapSetCoverType.List, keepLoaded ? 0 : 500, keepLoaded ? double_max_value : 1000).with({
        relativeSizeAxes: Axes.Both,
        onlineInfo,
      }),
      background = new Box().with({
        relativeSizeAxes: Axes.Both,
      }),
      foreground = new Container().with({
        relativeSizeAxes: Axes.Both,
        children: [
          playButton = new PlayButton(beatmapSetInfo).with({
            relativeSizeAxes: Axes.Both,
          }),
          progress = new CircularProgress().with({
            anchor: Anchor.Centre,
            origin: Anchor.Centre,
            innerRadius: 0.2,
          }),
          thumbnailContent = new Container().with({
            relativeSizeAxes: Axes.Both,
          }),
        ],
      }),
    ];

    this.background = background;
    this.foreground = foreground;
    this.playButton = playButton;
    this.progress = progress;
    this.thumbnailContent = thumbnailContent;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colourProvider = dependencies.resolve(OverlayColourProvider);
    this.progress.colour = this.colourProvider.highlight1;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.dimmed.bindValueChanged(() => this.updateState());
    this.playButton.playing.bindValueChanged(() => this.updateState(), true);
    this.finishTransforms(true);
  }

  protected override update(): void {
    super.update();

    this.progress.progress = this.playButton.progress.value;
    this.progress.size = new Vector2(50 * this.playButton.drawWidth / (card_normal_height - BeatmapCardConstants.CORNER_RADIUS));
  }

  private updateState(): void {
    const shouldDim = this.dimmed.value || this.playButton.playing.value;

    this.playButton.fadeTo(shouldDim ? 1 : 0, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
    this.background.fadeColour(this.colourProvider.background6.opacity(shouldDim ? 0.6 : 0), BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
  }
}
