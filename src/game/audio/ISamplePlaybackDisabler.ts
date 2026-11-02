// Ported from osu.Game/Audio/ISamplePlaybackDisabler.cs
// C# marks the interface [Cached], so an implementing drawable is cached as ISamplePlaybackDisabler for its children; DI keys are classes
// here, so implementations cache themselves with `dependencies.cacheAs(ISamplePlaybackDisabler, this)` and are recognised by their
// isSamplePlaybackDisabler marker. (IBindable<bool> is a Bindable<boolean> here.)

import type { Bindable } from '@fw/bindables/Bindable';

/**
 * Allows a component to disable sample playback dynamically as required.
 * Automatically handled by PausableSkinnableSound (here: StarFountainSounds' loop).
 */
export abstract class ISamplePlaybackDisabler {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as { isSamplePlaybackDisabler?: unknown } | null)?.isSamplePlaybackDisabler === true;
  }

  abstract readonly isSamplePlaybackDisabler: true;

  /** Whether sample playback should be disabled (or paused for looping samples). */
  abstract get samplePlaybackDisabled(): Bindable<boolean>;
}
