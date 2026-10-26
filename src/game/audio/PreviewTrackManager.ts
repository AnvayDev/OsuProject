// Ported from osu.Game/Audio/PreviewTrackManager.cs
// Web: previews come from the mirror (/api/media/preview/set/{id}, through MirrorResourceStore) instead of b.ppy.sh/preview, which sends no
// CORS headers (docs/spec/assets-formats.md §7). C#'s TrustedDomainOnlineStore becomes the mirror store.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AudioManager } from '@fw/audio/AudioManager';
import { AdjustableProperty, type IAdjustableAudioComponent } from '@fw/audio/AudioComponent';
import type { Track } from '@fw/audio/track/Track';
import type { TrackStore } from '@fw/audio/track/TrackStore';
import { BindableBool } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { Component } from '@fw/graphics/Component';
import { Logger } from '@fw/logging/Logger';
import type { IBeatmapSetInfo } from '../beatmaps/IBeatmapSetInfo';
import { MIRROR_ROOT, MirrorResourceStore } from '../online/api/MirrorAccess';
import { IPreviewTrackOwner } from './IPreviewTrackOwner';
import { PreviewTrack } from './PreviewTrack';

export class PreviewTrackManager extends Component {
  private readonly mainTrackAdjustments: IAdjustableAudioComponent;

  private readonly muteBindable = new BindableDouble();

  private trackStore!: TrackStore;

  protected currentTrack: TrackManagerPreviewTrack | null = null;

  readonly isPlayingPreview = new BindableBool();

  constructor(mainTrackAdjustments: IAdjustableAudioComponent) {
    super();

    this.mainTrackAdjustments = mainTrackAdjustments;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.trackStore = dependencies.resolve(AudioManager).getTrackStore(new MirrorResourceStore());

    return r;
  }

  /** Retrieves a PreviewTrack for a beatmap set. */
  get(beatmapSetInfo: IBeatmapSetInfo): PreviewTrack {
    const track = this.createPreviewTrack(beatmapSetInfo, this.trackStore);

    track.started.add(() => this.schedule(() => {
      this.currentTrack?.stop();
      this.currentTrack = track;
      this.mainTrackAdjustments.addAdjustment(AdjustableProperty.Volume, this.muteBindable);
      this.isPlayingPreview.value = true;
    }));

    track.stopped.add(() => this.schedule(() => {
      if (this.currentTrack !== track)
        return;

      this.currentTrack = null;
      this.mainTrackAdjustments.removeAdjustment(AdjustableProperty.Volume, this.muteBindable);
      this.isPlayingPreview.value = false;
    }));

    return track;
  }

  /**
   * Stops any currently playing PreviewTrack. Only the immediate owner (an object that implements IPreviewTrackOwner) of a playing
   * PreviewTrack can stop it.
   */
  stopAnyPlaying(source: IPreviewTrackOwner): void {
    if (this.currentTrack === null || (this.currentTrack.owner !== null && this.currentTrack.owner !== source))
      return;

    this.currentTrack.stop();
    // CurrentTrack should not be set to null here as it will result in incorrect handling in the track.Stopped callback above.
  }

  /** Creates the TrackManagerPreviewTrack. */
  protected createPreviewTrack(beatmapSetInfo: IBeatmapSetInfo, trackStore: TrackStore): TrackManagerPreviewTrack {
    return new TrackManagerPreviewTrack(beatmapSetInfo, trackStore);
  }
}

/** (PreviewTrackManager.TrackManagerPreviewTrack) */
export class TrackManagerPreviewTrack extends PreviewTrack {
  owner: IPreviewTrackOwner | null = null;

  private readonly beatmapSetInfo: IBeatmapSetInfo;
  private readonly trackManager: TrackStore;

  constructor(beatmapSetInfo: IBeatmapSetInfo, trackManager: TrackStore) {
    super();

    this.beatmapSetInfo = beatmapSetInfo;
    this.trackManager = trackManager;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    this.owner = dependencies.get(IPreviewTrackOwner);

    await super.load(dependencies);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    if (this.owner === null)
      Logger.log('A PreviewTrack was created without a containing IPreviewTrackOwner. An owner should be added for correct behaviour.');
  }

  protected override getTrack(): Promise<Track | null> {
    return this.trackManager.get(`${MIRROR_ROOT}/media/preview/set/${this.beatmapSetInfo.onlineID}`);
  }
}
