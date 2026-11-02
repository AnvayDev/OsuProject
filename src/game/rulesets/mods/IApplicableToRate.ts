// Ported from osu.Game/Rulesets/Mods/IApplicableToRate.cs
// TS interfaces don't exist at runtime: implementations are recognised by their members (instanceof uses Symbol.hasInstance).

import type { IAdjustableAudioComponent } from '@fw/audio/AudioComponent';

/** Interface that should be implemented by mods that affect the track playback speed, and in turn, values of the track rate. */
export abstract class IApplicableToRate {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return typeof (instance as IApplicableToRate | null)?.applyToRate === 'function';
  }

  /** Returns the playback rate at time after this mod is applied. */
  abstract applyToRate(time: number, rate?: number): number;

  // (IApplicableToAudio)
  abstract applyToTrack(track: IAdjustableAudioComponent): void;
  abstract applyToSample(sample: IAdjustableAudioComponent): void;
}
