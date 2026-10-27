// Ported from osu.Game/Beatmaps/Drawables/Cards/BeatmapCard.cs
// Not ported yet: the beatmap set overlay (the default action without shift shows it; there is none, as when C# resolves it as null) and
// context menus (IHasContextMenu). Only the Normal and Extra sizes exist (Nano isn't used by the listing).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import type { Drawable } from '@fw/graphics/Drawable';
import type { InputManager } from '@fw/input/InputManager';
import type { HoverEvent, HoverLostEvent } from '@fw/input/events/UIEvents';
import { Easing } from '@fw/transforms/Easing';
import { OsuConfigManager, OsuSetting } from '../../../configuration/OsuConfigManager';
import { OsuClickableContainer } from '../../../graphics/containers/OsuClickableContainer';
import { HoverSampleSet } from '../../../graphics/userInterface/HoverSampleSet';
import { OsuGame } from '../../../OsuGame';
import type { APIBeatmapSet } from '../../../online/api/requests/responses/APIBeatmapSet';
import { BeatmapDownloadTracker } from '../../../online/BeatmapDownloadTracker';
import { DownloadState } from '../../../online/DownloadState';
import { BeatmapModelDownloader } from '../../BeatmapModelDownloader';
import { BeatmapCardConstants } from './BeatmapCardConstants';
import type { BeatmapSetFavouriteState } from './BeatmapSetFavouriteState';

export abstract class BeatmapCard extends OsuClickableContainer {
  static readonly TRANSITION_DURATION = BeatmapCardConstants.TRANSITION_DURATION;
  static readonly CORNER_RADIUS = BeatmapCardConstants.CORNER_RADIUS;
  static readonly WIDTH = BeatmapCardConstants.WIDTH;

  readonly expanded: BindableBool;

  readonly beatmapSet: APIBeatmapSet;

  protected readonly favouriteState: Bindable<BeatmapSetFavouriteState>;

  protected abstract get idleContent(): Drawable;

  protected abstract get downloadInProgressContent(): Drawable;

  protected readonly downloadTracker: BeatmapDownloadTracker;

  private readonly preferNoVideo = new BindableBool();

  private containingInputManager: InputManager | null = null;

  private beatmaps: BeatmapModelDownloader | null = null;

  private game: OsuGame | null = null;

  protected constructor(beatmapSet: APIBeatmapSet, allowExpansion = true) {
    super(HoverSampleSet.Button);

    this.expanded = new BindableBool();
    this.expanded.disabled = !allowExpansion;

    this.beatmapSet = beatmapSet;
    this.favouriteState = new Bindable<BeatmapSetFavouriteState>({ favourited: beatmapSet.hasFavourited, favouriteCount: beatmapSet.favouriteCount });
    this.downloadTracker = new BeatmapDownloadTracker(beatmapSet);
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmaps = dependencies.get(BeatmapModelDownloader);
    this.game = dependencies.get(OsuGame);

    dependencies.resolve(OsuConfigManager).bindWith(OsuSetting.PreferNoVideo, this.preferNoVideo);

    this.addInternal(this.downloadTracker);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.downloadTracker.state.bindValueChanged(() => this.updateState());
    this.expanded.bindValueChanged(() => this.updateState(), true);
    this.finishTransforms(true);

    this.containingInputManager = this.getContainingInputManager();

    if (this.action === null)
      throw new Error('An action should be assigned to this BeatmapCard. To use the default, assign defaultAction.');
  }

  protected defaultAction(): void {
    if (this.containingInputManager?.currentState.keyboard.shiftPressed === true) {
      switch (this.downloadTracker.state.value) {
        case DownloadState.NotDownloaded:
          if (!this.beatmapSet.availability.downloadDisabled) this.beatmaps?.download(this.beatmapSet, this.preferNoVideo.value);
          break;

        case DownloadState.LocallyAvailable:
          this.game?.presentBeatmap(this.beatmapSet);
          break;
      }
    }
    // (else beatmapSetOverlay?.FetchAndShowBeatmapSet(BeatmapSet.OnlineID): not ported)
  }

  protected override onHover(e: HoverEvent): boolean {
    this.updateState();
    return super.onHover(e);
  }

  protected override onHoverLost(e: HoverLostEvent): void {
    this.updateState();
    super.onHoverLost(e);
  }

  protected updateState(): void {
    const showProgress = this.downloadTracker.state.value === DownloadState.Downloading || this.downloadTracker.state.value === DownloadState.Importing;

    this.idleContent.fadeTo(showProgress ? 0 : 1, BeatmapCard.TRANSITION_DURATION, Easing.OutQuint);
    this.downloadInProgressContent.fadeTo(showProgress ? 1 : 0, BeatmapCard.TRANSITION_DURATION, Easing.OutQuint);
  }
}
