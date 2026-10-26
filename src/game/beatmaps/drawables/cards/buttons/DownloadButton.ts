// Ported from osu.Game/Beatmaps/Drawables/Cards/Buttons/DownloadButton.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { FontAwesome } from '@fw/graphics/sprites/FontAwesome';
import { Easing } from '@fw/transforms/Easing';
import { OsuConfigManager, OsuSetting } from '../../../../configuration/OsuConfigManager';
import type { APIBeatmapSet } from '../../../../online/api/requests/responses/APIBeatmapSet';
import { DownloadState } from '../../../../online/DownloadState';
import { BeatmapModelDownloader } from '../../../BeatmapModelDownloader';
import { BeatmapCardConstants } from '../BeatmapCardConstants';
import { BeatmapCardIconButton } from './BeatmapCardIconButton';

export class DownloadButton extends BeatmapCardIconButton {
  readonly state = new Bindable<DownloadState>(DownloadState.Unknown);

  private readonly beatmapSet: APIBeatmapSet;

  private preferNoVideo!: Bindable<boolean>;

  private beatmaps!: BeatmapModelDownloader;

  constructor(beatmapSet: APIBeatmapSet) {
    super();

    this.beatmapSet = beatmapSet;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmaps = dependencies.resolve(BeatmapModelDownloader);
    this.preferNoVideo = dependencies.resolve(OsuConfigManager).getBindable<boolean>(OsuSetting.PreferNoVideo);
    this.icon.icon = FontAwesome.Solid.Download;

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.preferNoVideo.bindValueChanged(() => this.updateDownloadState());
    this.state.bindValueChanged(() => this.updateDownloadState(), true);
    this.finishTransforms(true);
  }

  /** (C#'s private updateState) */
  private updateDownloadState(): void {
    switch (this.state.value) {
      case DownloadState.Unknown:
        this.action = null;
        this.tooltipText = '';
        break;

      case DownloadState.Downloading:
      case DownloadState.Importing:
        this.action = null;
        this.tooltipText = '';
        this.setLoading(true);
        break;

      case DownloadState.LocallyAvailable:
        this.action = null;
        this.tooltipText = '';
        this.fadeOut(BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
        break;

      case DownloadState.NotDownloaded:
        if (this.beatmapSet.availability.downloadDisabled) {
          this.enabled.value = false;
          this.tooltipText = 'This beatmap is currently not available for download.';
          return;
        }

        this.action = () => this.beatmaps.download(this.beatmapSet, this.preferNoVideo.value);
        this.fadeIn(BeatmapCardConstants.TRANSITION_DURATION, Easing.OutQuint);
        this.setLoading(false);

        if (!this.beatmapSet.hasVideo)
          this.tooltipText = 'download';
        else
          this.tooltipText = this.preferNoVideo.value ? 'download without video' : 'download with video';
        break;
    }
  }
}
