// Ported from osu.Game/Beatmaps/FramedBeatmapClock.cs
// The platform offset uses the visitor's OS (RuntimeInfo.OS). AudioManager.UseExperimentalWasapi has no web counterpart, so it is never
// enabled and its binding is not ported. RealmAccess has no property change notifications, so the per-beatmap user offset is read once at
// LoadComplete (C#'s SubscribeToPropertyChanged applies the initial value immediately; nothing edits it yet). GetSnapshot (debug output) is
// not ported.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Bindable } from '@fw/bindables/Bindable';
import { Component } from '@fw/graphics/Component';
import { Platform, RuntimeInfo } from '@fw/RuntimeInfo';
import { DecouplingFramedClock } from '@fw/timing/DecouplingFramedClock';
import type { IAdjustableClock, IClock, IFrameBasedClock, ISourceChangeableClock } from '@fw/timing/IClock';
import { InterpolatingFramedClock } from '@fw/timing/InterpolatingFramedClock';
import { FramedOffsetClock } from '@fw/timing/OffsetClock';
import { OsuConfigManager, OsuSetting } from '../configuration/OsuConfigManager';
import { RealmAccess } from '../database/RealmAccess';
import { OffsetCorrectionClock } from '../screens/play/OffsetCorrectionClock';
import type { WorkingBeatmap } from './WorkingBeatmap';

/**
 * A clock intended to be the single source-of-truth for beatmap timing.
 *
 * It provides some functionality:
 *  - Optionally applies (and tracks changes of) beatmap, user, and platform offsets (see ctor argument applyOffsets).
 *  - Adjusts seek operations to account for any applied offsets, seeking in raw "beatmap" time values.
 *  - Exposes track length.
 *  - Allows changing the source to a new track (for cases like editor track updating).
 */
export class FramedBeatmapClock extends Component implements IFrameBasedClock, IAdjustableClock, ISourceChangeableClock {
  private readonly applyOffsets: boolean;

  private readonly userGlobalOffsetClock: OffsetCorrectionClock | null = null;
  private readonly platformOffsetClock: OffsetCorrectionClock | null = null;
  private readonly userBeatmapOffsetClock: FramedOffsetClock | null = null;

  private readonly finalClockSource: IFrameBasedClock;

  private userAudioOffset: Bindable<number> | null = null;

  private readonly decoupledTrack: DecouplingFramedClock;
  private readonly interpolatedTrack: InterpolatingFramedClock;

  private config!: OsuConfigManager;

  private realm!: RealmAccess;

  private beatmap!: Bindable<WorkingBeatmap>;

  /**
   * Store seek target for any seek performed before LoadState.Loaded.
   * Initial seeks must be delayed until the FramedBeatmapClock instance is fully loaded.
   * If not, totalAppliedOffset will not be in a correct state and result in a potentially incorrect seek target.
   */
  private initialSeek: number | null = null;

  private _isRewinding = false;

  get isRewinding(): boolean {
    return this._isRewinding;
  }

  constructor(applyOffsets: boolean, requireDecoupling: boolean, source: IClock | null = null) {
    super();

    this.applyOffsets = applyOffsets;

    this.decoupledTrack = new DecouplingFramedClock(source);
    this.decoupledTrack.allowDecoupling = requireDecoupling;

    // An interpolating clock is used to ensure precise time values even when the host audio subsystem is not reporting
    // high precision times (on windows there's generally only 5-10ms reporting intervals, as an example).
    this.interpolatedTrack = new InterpolatingFramedClock(this.decoupledTrack);
    this.interpolatedTrack.driftRecoveryHalfLife = 80;

    if (applyOffsets) {
      this.platformOffsetClock = new OffsetCorrectionClock(this.interpolatedTrack);

      // User global offset (set in settings) should also be applied.
      this.userGlobalOffsetClock = new OffsetCorrectionClock(this.platformOffsetClock);

      // User per-beatmap offset will be applied to this final clock.
      this.finalClockSource = this.userBeatmapOffsetClock = new FramedOffsetClock(this.userGlobalOffsetClock);
    } else {
      this.finalClockSource = this.interpolatedTrack;
    }
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.config = dependencies.resolve(OsuConfigManager);
    this.realm = dependencies.resolve(RealmAccess);
    // [Resolved] bindables are bound copies.
    this.beatmap = dependencies.resolve(Bindable<WorkingBeatmap>, 'WorkingBeatmap').getBoundCopy();

    return r;
  }

  protected override loadComplete(): void {
    super.loadComplete();

    if (this.applyOffsets) {
      const userBeatmapOffsetClock = this.userBeatmapOffsetClock!;
      const userGlobalOffsetClock = this.userGlobalOffsetClock!;

      this.userAudioOffset = this.config.getBindable<number>(OsuSetting.AudioOffset);
      this.userAudioOffset.bindValueChanged(offset => userGlobalOffsetClock.offset = offset.newValue, true);

      this.updatePlatformOffset();

      // TODO: this doesn't update when using ChangeSource() to change beatmap.
      const userSettings = this.realm.findBeatmap(this.beatmap.value.beatmapInfo.id)?.userSettings;
      if (userSettings != null)
        userBeatmapOffsetClock.offset = userSettings.offset;
    }

    if (this.initialSeek !== null) {
      this.seek(this.initialSeek);
      this.initialSeek = null;
    }
  }

  /**
   * Audio timings in general with newer BASS versions don't match stable.
   * This only seems to be required on windows. We need to eventually figure out why, with a bit of luck.
   */
  static readonly WINDOWS_BASE_AUDIO_OFFSET = 15;

  /** An additional offset applied to account for experimental mode being much better. */
  static readonly WINDOWS_EXPERIMENTAL_AUDIO_OFFSET = -25;

  private updatePlatformOffset(): void {
    if (!this.applyOffsets)
      return;

    const platformOffsetClock = this.platformOffsetClock!;

    switch (RuntimeInfo.OS) {
      case Platform.Windows:
        platformOffsetClock.offset = FramedBeatmapClock.WINDOWS_BASE_AUDIO_OFFSET;
        // (UseExperimentalWasapi is never enabled: WINDOWS_EXPERIMENTAL_AUDIO_OFFSET does not apply.)
        return;

      default:
        platformOffsetClock.offset = 0;
        break;
    }
  }

  protected override update(): void {
    super.update();

    this.finalClockSource.processFrame();

    if (this.clock!.elapsedFrameTime !== 0)
      this._isRewinding = this.clock!.elapsedFrameTime < 0;
  }

  get totalAppliedOffset(): number {
    if (!this.applyOffsets)
      return 0;

    return this.userGlobalOffsetClock!.rateAdjustedOffset + this.userBeatmapOffsetClock!.offset + this.platformOffsetClock!.rateAdjustedOffset;
  }

  // #region Delegation of IAdjustableClock / ISourceChangeableClock to decoupled clock.

  changeSource(source: IClock | null): void {
    this.decoupledTrack.changeSource(source);
  }

  get source(): IClock {
    return this.decoupledTrack.source;
  }

  reset(): void {
    this.decoupledTrack.reset();
    this.finalClockSource.processFrame();
  }

  start(): void {
    this.decoupledTrack.start();
    this.finalClockSource.processFrame();
  }

  stop(): void {
    this.decoupledTrack.stop();
    this.finalClockSource.processFrame();
  }

  seek(position: number): boolean {
    // TotalAppliedOffset will not be correct until fully loaded.
    if (this.applyOffsets && !this.isLoaded) {
      this.initialSeek = position;
      return true;
    }

    const success = this.decoupledTrack.seek(position - this.totalAppliedOffset);
    this.finalClockSource.processFrame();

    return success;
  }

  resetSpeedAdjustments(): void {
    this.decoupledTrack.resetSpeedAdjustments();
  }

  get rate(): number {
    return this.decoupledTrack.rate;
  }

  set rate(value: number) {
    this.decoupledTrack.rate = value;
  }

  // #endregion

  // #region Delegation of IFrameBasedClock to clock with all offsets applied

  get currentTime(): number {
    return this.initialSeek ?? this.finalClockSource.currentTime;
  }

  get isRunning(): boolean {
    return this.finalClockSource.isRunning;
  }

  processFrame(): void {
    // Noop to ensure an external consumer doesn't process the internal clock an extra time.
  }

  get elapsedFrameTime(): number {
    return this.finalClockSource.elapsedFrameTime;
  }

  get framesPerSecond(): number {
    return this.finalClockSource.framesPerSecond;
  }

  // #endregion
}
