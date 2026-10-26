// Ported from osu.Game/Beatmaps/Drawables/Cards/Buttons/GoToBeatmapButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { Easing } from '@fw/transforms/Easing';
import { OsuGame } from '../../../../OsuGame';
import type { APIBeatmapSet } from '../../../../online/api/requests/responses/APIBeatmapSet';
import { DownloadState } from '../../../../online/DownloadState';
import { BeatmapCardConstants } from '../BeatmapCardConstants';
import { BeatmapCardIconButton } from './BeatmapCardIconButton';

export class GoToBeatmapButton extends BeatmapCardIconButton {
  get state(): Bindable<DownloadState> {
    return this._state;
  }

  private readonly _state = new Bindable<DownloadState>(DownloadState.Unknown);

  private readonly beatmapSet: APIBeatmapSet;
  private readonly allowNavigationToBeatmap: boolean;

  constructor(beatmapSet: APIBeatmapSet, allowNavigationToBeatmap: boolean) {
    super();

    this.beatmapSet = beatmapSet;
    this.allowNavigationToBeatmap = allowNavigationToBeatmap;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    const game = dependencies.get(OsuGame);

    this.action = () => game?.presentBeatmap(this.beatmapSet);
    this.icon.icon = FontAwesome.Solid.AngleDoubleRight;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this._state.bindValueChanged(() => this.updateNavigationState(), true);
    this.finishTransforms(true);
  }

  /** (C#'s private updateState) */
  private updateNavigationState(): void {
    const available = this._state.value === DownloadState.LocallyAvailable;

    this.enabled.value = this.allowNavigationToBeatmap && available;

    let alpha: number;

    if (available && this.allowNavigationToBeatmap) {
      this.tooltipText = 'Go to beatmap';
      this.enabled.value = true;
      alpha = 1;
    } else if (available) {
      this.tooltipText = '';
      this.enabled.value = false;
      alpha = 0.3;
    } else {
      this.tooltipText = '';
      this.enabled.value = false;
      alpha = 0;
    }

    this.fadeTo(alpha, BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
  }
}
