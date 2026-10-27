// Ported from osu.Game/Graphics/Containers/BeatSyncedContainer.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import { Container } from '@fw/graphics/containers/Container';
import { EffectControlPoint } from '../../beatmaps/controlPoints/EffectControlPoint';
import { TimingControlPoint } from '../../beatmaps/controlPoints/TimingControlPoint';
import { IBeatSyncProvider } from '../../beatmaps/IBeatSyncProvider';

/**
 * A container which fires a callback when a new beat is reached.
 * Consumes a parent IBeatSyncProvider.
 *
 * This container does not set its own clock to the source used for beat matching.
 * This means that if the beat source clock is playing faster or slower, animations may unexpectedly overlap.
 * Make sure this container's Clock is also set to the expected source (or within a parent element which provides this).
 *
 * This container will also trigger beat events when the beat matching clock is paused at TimingControlPoint.DEFAULT's BPM.
 */
export class BeatSyncedContainer extends Container {
  private lastBeat = 0;

  private lastTimingPoint: TimingControlPoint | null = null;

  private _isKiaiTime = false;

  protected get isKiaiTime(): boolean {
    return this._isKiaiTime;
  }

  /**
   * The amount of time before a beat we should fire onNewBeat.
   * This allows for adding easing to animations that may be synchronised to the beat.
   */
  protected earlyActivationMilliseconds = 0;

  /**
   * While this container automatically applied an animation delay (meaning any animations inside a onNewBeat implementation will
   * always be correctly timed), the event itself can potentially fire away from the related beat.
   *
   * By setting this to false, cases where the event is to be fired more than MISTIMED_ALLOWANCE from the related beat will be skipped.
   */
  protected allowMistimedEventFiring = true;

  /** The maximum deviance from the actual beat that an onNewBeat can fire when allowMistimedEventFiring is set to false. */
  static readonly MISTIMED_ALLOWANCE = 16;

  private _timeUntilNextBeat = 0;

  /** The time in milliseconds until the next beat. */
  get timeUntilNextBeat(): number {
    return this._timeUntilNextBeat;
  }

  private _timeSinceLastBeat = 0;

  /** The time in milliseconds since the last beat */
  get timeSinceLastBeat(): number {
    return this._timeSinceLastBeat;
  }

  /** How many beats per beatlength to trigger. Defaults to 1. */
  divisor = 1;

  /** An optional minimum beat length. Any beat length below this will be multiplied by two until valid. */
  minimumBeatLength = 0;

  private _isBeatSyncedWithTrack = false;

  /** Whether this container is currently tracking a beat sync provider. */
  protected get isBeatSyncedWithTrack(): boolean {
    return this._isBeatSyncedWithTrack;
  }

  private _timingPoint: TimingControlPoint = TimingControlPoint.DEFAULT;

  /** The most valid timing point, updated every frame. */
  protected get timingPoint(): TimingControlPoint {
    return this._timingPoint;
  }

  private _effectPoint: EffectControlPoint = EffectControlPoint.DEFAULT;

  /** The most valid effect point, updated every frame. */
  protected get effectPoint(): EffectControlPoint {
    return this._effectPoint;
  }

  protected beatSyncSource!: IBeatSyncProvider;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.beatSyncSource = dependencies.resolve(IBeatSyncProvider);

    return r;
  }

  protected onNewBeat(_beatIndex: number, _timingPoint: TimingControlPoint, _effectPoint: EffectControlPoint, _amplitudes: ChannelAmplitudes): void {
  }

  protected override update(): void {
    const clock = this.clock!;

    this._isBeatSyncedWithTrack = this.beatSyncSource.clock.isRunning;

    let currentTrackTime: number;

    if (this._isBeatSyncedWithTrack) {
      let early = this.earlyActivationMilliseconds;

      // In the case of gameplay, we are usually within a hierarchy with the correct rate applied to our `Drawable.Clock`.
      // This means that the amount of early adjustment is adjusted in line with audio track rate changes.
      // But other cases like the osu! logo at the main menu won't correctly have this rate information.
      // We can adjust here to ensure the applied early activation always matches expectations.
      if (clock.rate > 0)
        early *= this.beatSyncSource.clock.rate / clock.rate;

      currentTrackTime = this.beatSyncSource.clock.currentTime + early;

      this._timingPoint = this.beatSyncSource.controlPoints?.timingPointAt(currentTrackTime) ?? TimingControlPoint.DEFAULT;
      this._effectPoint = this.beatSyncSource.controlPoints?.effectPointAt(currentTrackTime) ?? EffectControlPoint.DEFAULT;
    } else {
      // this may be the case where the beat syncing clock has been paused.
      // we still want to show an idle animation, so use this container's time instead.
      currentTrackTime = clock.currentTime + this.earlyActivationMilliseconds;

      this._timingPoint = TimingControlPoint.DEFAULT;
      this._effectPoint = EffectControlPoint.DEFAULT;
    }

    let beatLength = this._timingPoint.beatLength / this.divisor;

    while (beatLength < this.minimumBeatLength)
      beatLength *= 2;

    // (C#'s (int) cast truncates toward zero.)
    let beatIndex = Math.trunc((currentTrackTime - this._timingPoint.time) / beatLength) - (this._timingPoint.omitFirstBarLine ? 1 : 0);

    // The beats before the start of the first control point are off by 1, this should do the trick
    if (currentTrackTime < this._timingPoint.time)
      beatIndex--;

    this._timeUntilNextBeat = (this._timingPoint.time - currentTrackTime) % beatLength;
    if (this._timeUntilNextBeat <= 0)
      this._timeUntilNextBeat += beatLength;

    this._timeSinceLastBeat = beatLength - this._timeUntilNextBeat;

    if (this._timingPoint === this.lastTimingPoint && beatIndex === this.lastBeat)
      return;

    // as this event is sometimes used for sound triggers where `BeginDelayedSequence` has no effect, avoid firing it if too far away from the beat.
    // this can happen after a seek operation.
    if (this.allowMistimedEventFiring || Math.abs(this._timeSinceLastBeat) < BeatSyncedContainer.MISTIMED_ALLOWANCE) {
      const sequence = this.beginDelayedSequence(-this._timeSinceLastBeat);

      try {
        this.onNewBeat(beatIndex, this._timingPoint, this._effectPoint, this.beatSyncSource.currentAmplitudes);
      } finally {
        sequence.dispose();
      }
    }

    this.lastBeat = beatIndex;
    this.lastTimingPoint = this._timingPoint;

    this._isKiaiTime = this._effectPoint.kiaiMode;
  }
}
