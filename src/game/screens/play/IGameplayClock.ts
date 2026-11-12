// Ported from osu.Game/Screens/Play/IGameplayClock.cs and GameplayClockExtensions.cs

import type { IAdjustableAudioComponent } from '@fw/audio/AudioComponent';
import type { Bindable } from '@fw/bindables/Bindable';
import type { IClock, IFrameBasedClock } from '@fw/timing/IClock';

export interface IGameplayClock extends IFrameBasedClock {
  /**
   * The time from which the clock should start. Will be seeked to on calling GameplayClockContainer.Reset.
   * By default, a value of zero will be used. Importantly, the value will be inferred from the current beatmap in MasterGameplayClockContainer by default.
   */
  readonly startTime: number;

  /** The time from which actual gameplay should start. When intro time is skipped, this will be the seeked location. */
  readonly gameplayStartTime: number;

  /** All adjustments applied to this clock which come from mods. */
  readonly adjustmentsFromMods: IAdjustableAudioComponent;

  readonly isPaused: Bindable<boolean>;

  /** Whether the clock is currently rewinding. */
  readonly isRewinding: boolean;
}

/** `clock as IGameplayClock` in C#: a gameplay clock is recognised by its members. */
export const isGameplayClock = (clock: IClock | null): clock is IGameplayClock =>
  clock !== null && 'adjustmentsFromMods' in clock && 'isRewinding' in clock;

/**
 * The game-wide rate at which the gameplay clock is running, as applied by mods (not including any rate adjustments from the audio
 * offset or frame stability catch-up, nor pausing).
 */
export function getTrueGameplayRate(clock: IGameplayClock): number {
  // To handle rewind, we still want to maintain the same direction as the underlying clock.
  const rate = clock.rate === 0 ? 1 : Math.sign(clock.rate);

  return rate
    * clock.adjustmentsFromMods.aggregateFrequency.value
    * clock.adjustmentsFromMods.aggregateTempo.value;
}
