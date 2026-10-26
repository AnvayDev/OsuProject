// Ported from osu.Game/Overlays/MusicController.cs
// Not ported: mod track adjustments (there are no mods, so ResetTrackAdjustments binds an empty AudioAdjustments when applyModTrackAdjustments is set).
// Live<BeatmapSetInfo> is the BeatmapSetInfo itself (RealmAccess keeps the sets in memory); its equality is BeatmapSetInfo.equals (by ID).

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { AdjustableProperty, AudioAdjustments } from '@fw/audio/AudioComponent';
import { AudioManager } from '@fw/audio/AudioManager';
import { TrackVirtual } from '@fw/audio/track/TrackVirtual';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { BindableDouble, type BindableNumber } from '@fw/bindables/BindableNumber';
import { Signal } from '@fw/bindables/Signal';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { DrawableTrack } from '@fw/graphics/audio/DrawableTrack';
import { Logger } from '@fw/logging/Logger';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { Easing } from '@fw/transforms/Easing';
import { AudioFilter } from '../audio/effects/AudioFilter';
import { BeatmapManager } from '../beatmaps/BeatmapManager';
import type { BeatmapSetInfo } from '../beatmaps/BeatmapSetInfo';
import type { WorkingBeatmap } from '../beatmaps/WorkingBeatmap';
import { OsuConfigManager, OsuSetting } from '../configuration/OsuConfigManager';
import { RandomSelectAlgorithm } from '../configuration/RandomSelectAlgorithm';
import { RealmAccess } from '../database/RealmAccess';

/** SeasonalUIConfig.ENABLED */
const seasonal_ui_enabled = false;

/** IntroChristmas.CHRISTMAS_BEATMAP_SET_HASH */
const christmas_beatmap_set_hash = '7e26183e72a496f672c3a21292e6b469fdecd084d31c259ea10a31df5b46cd77';

/** Handles playback of the global music track. */
export class MusicController extends CompositeDrawable {
  private beatmaps!: BeatmapManager;

  /** Point in time after which the current track will be restarted on triggering a "previous track" action. */
  private static readonly restart_cutoff_point = 5000;

  /** Delay before the volume of the new track begins to fade in (the previous track's volume has fully faded out by then). */
  static readonly DELAY_BEFORE_FADE = 30;

  /** Whether the user has requested the track to be paused. Use isPlaying to determine whether the track is still playing. */
  userPauseRequested = false;

  /** Whether user control of the global track should be allowed. */
  readonly allowTrackControl = new BindableBool(true);

  readonly shuffle = new BindableBool(true);

  /** Fired when the global WorkingBeatmap has changed. Includes direction information for display purposes. */
  readonly trackChanged = new Signal<[WorkingBeatmap, TrackChangeDirection]>();

  private beatmap!: Bindable<WorkingBeatmap>;

  /** The current audio track. */
  currentTrack: DrawableTrack = new DrawableTrack(new TrackVirtual(1000));

  private realm!: RealmAccess;

  private sampleVolume!: BindableNumber;

  private readonly audioDuckVolume = new BindableDouble(1);

  private audioDuckFilter!: AudioFilter;

  private readonly randomSelectAlgorithm = new Bindable<RandomSelectAlgorithm>(RandomSelectAlgorithm.RandomPermutation);

  /** LinkedList<Live<BeatmapSetInfo>>, with currentRandomHistoryPosition as an index into it. */
  private readonly randomHistory: BeatmapSetInfo[] = [];
  private currentRandomHistoryPosition: number | null = null;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatmaps = dependencies.resolve(BeatmapManager);
    // [Resolved] bindables are bound copies (SourceGeneratorUtils.GetDependency, rebindBindables).
    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();
    this.realm = dependencies.resolve(RealmAccess);

    const audio = dependencies.resolve(AudioManager);
    this.addInternal(this.audioDuckFilter = new AudioFilter(audio.trackMixer));
    audio.tracks.addAdjustment(AdjustableProperty.Volume, this.audioDuckVolume);
    this.sampleVolume = audio.volumeSample.getBoundCopy();

    dependencies.resolve(OsuConfigManager).bindWith(OsuSetting.RandomSelectAlgorithm, this.randomSelectAlgorithm);

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.beatmap.bindValueChanged(b => {
      if (b.newValue != null)
        this.changeBeatmap(b.newValue);
    }, true);

    this.resetTrackAdjustments();
  }

  /** Forcefully reload the current WorkingBeatmap's track from disk. */
  reloadCurrentTrack(): void {
    if (this.current === null)
      return;

    this.changeTrack();
    this.trackChanged.emit([this.current, TrackChangeDirection.None]);
  }

  /** Returns whether the beatmap track is playing. */
  get isPlaying(): boolean {
    return this.currentTrack.isRunning;
  }

  /** Returns whether the beatmap track is loaded. */
  get trackLoaded(): boolean {
    return this.currentTrack.trackLoaded;
  }

  private seekDelegate: ScheduledDelegate | null = null;

  seekTo(position: number): void {
    this.seekDelegate?.cancel();
    this.seekDelegate = this.schedule(() => {
      if (!this.allowTrackControl.value)
        return;

      this.currentTrack.seek(position);
    });
  }

  /** Ensures music is playing, no matter what, unless the user has explicitly paused. This means that if the current beatmap has a virtual track (see TrackVirtual) a new beatmap will be selected. */
  ensurePlayingSomething(): void {
    if (this.userPauseRequested) return;

    if (this.currentTrack.isDummyDevice || this.beatmap.value.beatmapSetInfo.deletePending) {
      if (this.beatmap.disabled || !this.allowTrackControl.value)
        return;

      Logger.log('MusicController skipping next track to EnsurePlayingSomething');
      this.nextTrack(null, true);
    } else if (!this.isPlaying) {
      Logger.log('MusicController starting playback to EnsurePlayingSomething');
      this.play();
    }
  }

  /**
   * Start playing the current track (if not already playing).
   * restart: whether to restart the track from the beginning. requestedByUser: whether the request to play was issued by the user rather than internally.
   * Returns whether the operation was successful.
   */
  play(restart = false, requestedByUser = false): boolean {
    if (requestedByUser && !this.allowTrackControl.value)
      return false;

    if (requestedByUser)
      this.userPauseRequested = false;

    if (restart)
      this.currentTrack.restart();
    else if (!this.isPlaying)
      this.currentTrack.start();

    return true;
  }

  /** Stop playing the current track and pause at the current position. requestedByUser: whether the request to stop was issued by the user rather than internally. */
  stop(requestedByUser = false): void {
    if (requestedByUser && !this.allowTrackControl.value)
      return;

    this.userPauseRequested ||= requestedByUser;
    if (this.currentTrack.isRunning)
      this.currentTrack.stop();
  }

  /** Toggle pause / play. Returns whether the operation was successful. */
  togglePause(): boolean {
    if (!this.allowTrackControl.value)
      return false;

    if (this.currentTrack.isRunning)
      this.stop(true);
    else
      this.play(false, true);

    return true;
  }

  /** Play the previous track or restart the current track if it's current time below restart_cutoff_point. */
  previousTrack(onSuccess: ((res: PreviousTrackResult) => void) | null = null, allowProtectedTracks = false): void {
    this.schedule(() => {
      const res = this.prev(allowProtectedTracks);
      if (res !== PreviousTrackResult.None)
        onSuccess?.(res);
    });
  }

  /** Play the previous track or restart the current track if it's current time below restart_cutoff_point. */
  private prev(allowProtectedTracks: boolean): PreviousTrackResult {
    if (this.beatmap.disabled || !this.allowTrackControl.value)
      return PreviousTrackResult.None;

    const currentTrackPosition = this.currentTrack.currentTime;

    if (currentTrackPosition >= MusicController.restart_cutoff_point) {
      this.seekTo(0);
      return PreviousTrackResult.Restart;
    }

    this.queuedDirection = TrackChangeDirection.Prev;

    let playableSet: BeatmapSetInfo | null;

    if (this.shuffle.value)
      playableSet = this.getNextRandom(-1, allowProtectedTracks);
    else {
      const sets = this.getBeatmapSets(allowProtectedTracks);
      const index = sets.findIndex(i => i.equals(this.current?.beatmapSetInfo ?? null));
      playableSet = (index < 0 ? sets : sets.slice(0, index)).at(-1) ?? sets.at(-1) ?? null;
    }

    if (playableSet !== null) {
      this.changeBeatmap(this.beatmaps.getWorkingBeatmap(playableSet.beatmaps[0]));
      this.restartTrack();
      return PreviousTrackResult.Previous;
    }

    return PreviousTrackResult.None;
  }

  /** Play the next random or playlist track. */
  nextTrack(onSuccess: (() => void) | null = null, allowProtectedTracks = false): void {
    this.schedule(() => {
      const res = this.next(allowProtectedTracks);
      if (res)
        onSuccess?.();
    });
  }

  private readonly duckOperations: DuckParameters[] = [];

  /**
   * Applies ducking, attenuating the volume and/or low-pass cutoff of the currently playing track to make headroom for effects (or just to apply an effect).
   * @returns A handle which will restore the duck operation when disposed.
   */
  duck(parameters: DuckParameters | null = null): { dispose(): void } {
    // Don't duck if samples have no volume, it sounds weird.
    if (this.sampleVolume.value === 0)
      return { dispose: () => {} };

    const p = parameters ?? new DuckParameters();

    this.duckOperations.push(p);

    const volumeOperation = minBy(this.duckOperations, o => o.duckVolumeTo)!;
    const lowPassOperation = minBy(this.duckOperations, o => o.duckCutoffTo)!;

    this.audioDuckFilter.cutoffTo(lowPassOperation.duckCutoffTo, lowPassOperation.duckDuration, lowPassOperation.duckEasing);
    this.transformBindableTo(this.audioDuckVolume, volumeOperation.duckVolumeTo, volumeOperation.duckDuration, volumeOperation.duckEasing);

    const restoreDucking = () => this.schedule(() => {
      const index = this.duckOperations.indexOf(p);
      if (index < 0)
        return;

      this.duckOperations.splice(index, 1);

      const restoreVolumeOperation = minBy(this.duckOperations, o => o.duckVolumeTo);
      const restoreLowPassOperation = minBy(this.duckOperations, o => o.duckCutoffTo);

      // If another duck operation is in the list, restore ducking to its level, else reset back to defaults.
      this.audioDuckFilter.cutoffTo(restoreLowPassOperation?.duckCutoffTo ?? AudioFilter.MAX_LOWPASS_CUTOFF, p.restoreDuration, p.restoreEasing);
      this.transformBindableTo(this.audioDuckVolume, restoreVolumeOperation?.duckVolumeTo ?? 1, p.restoreDuration, p.restoreEasing);
    });

    return { dispose: restoreDucking };
  }

  /**
   * A convenience method that ducks the currently playing track, then after a delay, restores automatically.
   * @param delayUntilRestore A delay in milliseconds which defines how long to delay restoration after ducking completes.
   * @param parameters Parameters defining the ducking operation.
   */
  duckMomentarily(delayUntilRestore: number, parameters: DuckParameters | null = null): void {
    // Don't duck if samples have no volume, it sounds weird.
    if (this.sampleVolume.value === 0)
      return;

    const duckOperation = this.duck(parameters ?? new DuckParameters());

    this.scheduler.addDelayed(() => duckOperation.dispose(), delayUntilRestore);
  }

  private next(allowProtectedTracks: boolean): boolean {
    if (this.beatmap.disabled || !this.allowTrackControl.value)
      return false;

    this.queuedDirection = TrackChangeDirection.Next;

    let playableSet: BeatmapSetInfo | null;

    if (this.shuffle.value)
      playableSet = this.getNextRandom(1, allowProtectedTracks);
    else {
      const sets = this.getBeatmapSets(allowProtectedTracks);
      const index = sets.findIndex(i => i.equals(this.current?.beatmapSetInfo ?? null));
      playableSet = (index < 0 ? null : sets[index + 1] ?? null) ?? sets[0] ?? null;
    }

    const playableBeatmap = playableSet?.beatmaps[0] ?? null;

    if (playableBeatmap !== null) {
      this.changeBeatmap(this.beatmaps.getWorkingBeatmap(playableBeatmap));
      this.restartTrack();
      return true;
    }

    return false;
  }

  private getNextRandom(direction: number, allowProtectedTracks: boolean): BeatmapSetInfo | null {
    let result: BeatmapSetInfo;

    let possibleSets = this.getBeatmapSets(allowProtectedTracks);

    if (possibleSets.length === 0)
      return null;

    // if there is only one possible set left, play it, even if it is the same as the current track.
    // looping is preferable over playing nothing.
    if (possibleSets.length === 1)
      return possibleSets[0];

    // now that we actually know there is a choice, do not allow the current track to be played again.
    possibleSets = possibleSets.filter(s => !s.equals(this.current?.beatmapSetInfo ?? null));

    if (this.currentRandomHistoryPosition !== null) {
      if (direction < 0 && this.currentRandomHistoryPosition > 0)
        return this.randomHistory[--this.currentRandomHistoryPosition];

      if (direction > 0 && this.currentRandomHistoryPosition < this.randomHistory.length - 1)
        return this.randomHistory[++this.currentRandomHistoryPosition];
    }

    // if the early-return above didn't cover it, it means that we have no history to fall back on
    // and need to actually choose something random.
    switch (this.randomSelectAlgorithm.value) {
      case RandomSelectAlgorithm.Random:
        result = possibleSets[Math.floor(Math.random() * possibleSets.length)];
        break;

      case RandomSelectAlgorithm.RandomPermutation: {
        let notYetPlayedSets = possibleSets.filter(s => !this.randomHistory.some(h => h.equals(s)));

        if (notYetPlayedSets.length === 0) {
          notYetPlayedSets = possibleSets.filter(s => !s.equals(this.current?.beatmapSetInfo ?? null));
          this.randomHistory.length = 0;
          this.currentRandomHistoryPosition = null;
        }

        result = notYetPlayedSets[Math.floor(Math.random() * notYetPlayedSets.length)];

        if (direction > 0) {
          this.randomHistory.push(result);
          this.currentRandomHistoryPosition = this.randomHistory.length - 1;
        } else if (direction < 0) {
          this.randomHistory.unshift(result);
          this.currentRandomHistoryPosition = 0;
        }

        break;
      }

      default:
        throw new RangeError(`Unsupported random select algorithm ${this.randomSelectAlgorithm.value}`);
    }

    return result;
  }

  private restartTrack(): void {
    // if not scheduled, the previously track will be stopped one frame later (see ScheduleAfterChildren logic in GameBase).
    // we probably want to move this to a central method for switching to a new working beatmap in the future.
    this.schedule(() => this.currentTrack.restart());
  }

  private current: WorkingBeatmap | null = null;

  private queuedDirection: TrackChangeDirection | null = null;

  private getBeatmapSets(allowProtectedTracks: boolean): BeatmapSetInfo[] {
    return this.realm.allBeatmapSets().filter(s => !s.deletePending)
      .filter(i => (allowProtectedTracks || !i.isProtected)
        && (seasonal_ui_enabled || i.hash !== christmas_beatmap_set_hash));
  }

  private changeBeatmap(newWorking: WorkingBeatmap): void {
    // This method can potentially be triggered multiple times as it is eagerly fired in next() / prev() to ensure correct execution order
    // (changeBeatmap must be called before consumers receive the bindable changed event, which is not the case when the local beatmap bindable is updated directly).
    if (newWorking === this.current)
      return;

    const lastWorking = this.current;

    let direction = TrackChangeDirection.None;

    const audioEquals = newWorking.beatmapInfo?.audioEquals(this.current?.beatmapInfo ?? null) === true;

    if (this.current !== null) {
      if (audioEquals)
        direction = TrackChangeDirection.None;
      else if (this.queuedDirection !== null) {
        direction = this.queuedDirection;
        this.queuedDirection = null;
      } else {
        // figure out the best direction based on order in playlist.
        const sets = this.getBeatmapSets(false);
        const countUntil = (set: BeatmapSetInfo) => {
          const i = sets.findIndex(b => b.equals(set));
          return i < 0 ? sets.length : i;
        };

        const last = countUntil(this.current.beatmapSetInfo);
        const next = countUntil(newWorking.beatmapSetInfo);

        direction = last > next ? TrackChangeDirection.Prev : TrackChangeDirection.Next;
      }
    }

    this.current = newWorking;

    if (lastWorking === null || !lastWorking.tryTransferTrack(this.current))
      this.changeTrack();

    this.trackChanged.emit([this.current, direction]);

    this.resetTrackAdjustments();

    this.queuedDirection = null;

    // this will be a noop if coming from the beatmapChanged event.
    // the exception is local operations like next/prev, where we want to complete loading the track before sending out a change.
    if (this.beatmap.value !== this.current)
      this.beatmap.value = this.current;
  }

  private changeTrack(): void {
    const track_fade_in_time = 220;
    const track_fade_out_time = 150;

    const queuedTrack = this.getQueuedTrack();

    const lastTrack = this.currentTrack;
    lastTrack.completed.remove(this.onTrackCompleted);
    lastTrack.volumeTo(0, track_fade_out_time, Easing.Out).expire();

    this.currentTrack = queuedTrack;

    queuedTrack.volume.value = 0;
    this.addInternal(queuedTrack);
    queuedTrack.delay(MusicController.DELAY_BEFORE_FADE).volumeTo(1, track_fade_in_time);
  }

  private getQueuedTrack(): DrawableTrack {
    // Important to keep this in its own method to avoid inadvertently capturing unnecessary variables in the callback.
    // Can lead to leaks.
    const queuedTrack = new DrawableTrack(this.current!.loadTrack());
    queuedTrack.completed.add(this.onTrackCompleted);
    return queuedTrack;
  }

  private readonly onTrackCompleted = (): void => {
    if (!this.currentTrack.looping && !this.beatmap.disabled && this.allowTrackControl.value)
      this.nextTrack(null, true);
  };

  private _applyModTrackAdjustments = false;

  /** Whether mod track adjustments are allowed to be applied. */
  get applyModTrackAdjustments(): boolean {
    return this._applyModTrackAdjustments;
  }

  set applyModTrackAdjustments(value: boolean) {
    if (this._applyModTrackAdjustments === value)
      return;

    this._applyModTrackAdjustments = value;
    this.resetTrackAdjustments();
  }

  private modTrackAdjustments: AudioAdjustments | null = null;

  /** Resets the adjustments currently applied on currentTrack and applies the mod adjustments if applyModTrackAdjustments is true. Does not reset any adjustments applied directly to the beatmap track. */
  resetTrackAdjustments(): void {
    // todo: we probably want a helper method rather than this.
    this.currentTrack.removeAllAdjustments(AdjustableProperty.Balance);
    this.currentTrack.removeAllAdjustments(AdjustableProperty.Frequency);
    this.currentTrack.removeAllAdjustments(AdjustableProperty.Tempo);
    this.currentTrack.removeAllAdjustments(AdjustableProperty.Volume);

    if (this._applyModTrackAdjustments)
      this.currentTrack.bindAdjustments(this.modTrackAdjustments = new AudioAdjustments());
  }
}

export enum TrackChangeDirection {
  None,
  Next,
  Prev,
}

export enum PreviousTrackResult {
  None,
  Restart,
  Previous,
}

/** Enumerable.MinBy: the first element with the smallest key, or undefined when empty. */
function minBy<T>(items: readonly T[], key: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestKey = Infinity;

  for (const item of items) {
    const k = key(item);
    if (best === undefined || k < bestKey) {
      best = item;
      bestKey = k;
    }
  }

  return best;
}

export class DuckParameters {
  /** The duration of the ducking transition in milliseconds. Defaults to 100 ms. */
  duckDuration = 100;

  /** The final volume which should be reached during ducking, when 0 is silent and 1 is original volume. Defaults to 25%. */
  duckVolumeTo = 0.25;

  /** The low-pass cutoff frequency which should be reached during ducking. If not required, set to AudioFilter.MAX_LOWPASS_CUTOFF. Defaults to 300 Hz. */
  duckCutoffTo = 300;

  /** The easing curve to be applied during ducking. Defaults to Easing.Out. */
  duckEasing = Easing.Out;

  /** The duration of the restoration transition in milliseconds. Defaults to 500 ms. */
  restoreDuration = 500;

  /** The easing curve to be applied during restoration. Defaults to Easing.In. */
  restoreEasing = Easing.In;

  /** C#'s object initialiser. */
  static of(init: Partial<DuckParameters>): DuckParameters {
    return Object.assign(new DuckParameters(), init);
  }
}
