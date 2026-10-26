// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapCardDownloadProgressBar.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { CircularContainer } from '@fw/graphics/containers/CircularContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { Box } from '@fw/graphics/shapes/Box';
import { Axes } from '@fw/layout/Enums';
import { Easing } from '@fw/transforms/Easing';
import { OsuColour } from '../../../graphics/OsuColour';
import { DownloadState } from '../../../online/DownloadState';
import { OverlayColourProvider } from '../../../overlays/OverlayColourProvider';
import { BeatmapCardConstants } from './BeatmapCardConstants';

export class BeatmapCardDownloadProgressBar extends CompositeDrawable {
  get state(): Bindable<DownloadState> {
    return this._state;
  }

  private readonly _state = new Bindable<DownloadState>(DownloadState.Unknown);

  get progress(): Bindable<number> {
    return this._progress;
  }

  private readonly _progress = new BindableDouble();

  override get isPresent(): boolean {
    return true;
  }

  private readonly backgroundFill: Box;
  private readonly foregroundFill: Box;

  private colours!: OsuColour;
  private colourProvider!: OverlayColourProvider;

  constructor() {
    super();

    let backgroundFill!: Box;
    let foregroundFill!: Box;

    this.internalChild = new CircularContainer().with({
      relativeSizeAxes: Axes.Both,
      masking: true,
      children: [
        backgroundFill = new Box().with({
          relativeSizeAxes: Axes.Both,
        }),
        foregroundFill = new Box().with({
          relativeSizeAxes: Axes.Both,
        }),
      ],
    });

    this.backgroundFill = backgroundFill;
    this.foregroundFill = foregroundFill;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.colours = dependencies.resolve(OsuColour);
    this.colourProvider = dependencies.resolve(OverlayColourProvider);

    this.backgroundFill.colour = this.colourProvider.background6;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this._state.bindValueChanged(() => this.stateChanged(), true);
    this._progress.bindValueChanged(() => this.progressChanged(), true);
  }

  private stateChanged(): void {
    switch (this._state.value) {
      case DownloadState.Downloading:
        this.finishTransforms(true);
        this.foregroundFill.colour = this.colourProvider.highlight1;
        break;

      case DownloadState.Importing:
        this.foregroundFill.fadeColour(this.colours.yellow, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
        break;
    }
  }

  private progressChanged(): void {
    this.foregroundFill.resizeWidthTo(Math.fround(this._progress.value), this._progress.value > 0 ? BeatmapCardConstants.TRANSITION_DURATION : 0, Easing.OutQuint);
  }
}
