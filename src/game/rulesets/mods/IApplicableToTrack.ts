// Ported from osu.Game/Rulesets/Mods/IApplicableToTrack.cs, IApplicableToSample.cs and IApplicableToAudio.cs
// TS interfaces don't exist at runtime: implementations are recognised by their members (instanceof uses Symbol.hasInstance).

import type { IAdjustableAudioComponent } from '@fw/audio/AudioComponent';

/** An interface for mods that make adjustments to a track. */
export abstract class IApplicableToTrack {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return typeof (instance as IApplicableToTrack | null)?.applyToTrack === 'function';
  }

  abstract applyToTrack(track: IAdjustableAudioComponent): void;
}

/** An interface for mods that make adjustments to a sample. */
export abstract class IApplicableToSample {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return typeof (instance as IApplicableToSample | null)?.applyToSample === 'function';
  }

  abstract applyToSample(sample: IAdjustableAudioComponent): void;
}
