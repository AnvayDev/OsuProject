// Ported from osu.Game/Audio/SamplePlaybackHelper.cs

import type { Sample } from '@fw/audio/sample/Sample';
import type { SampleChannel } from '@fw/audio/sample/SampleChannel';
import { RNG } from '@fw/utils/RNG';

export const SamplePlaybackHelper = {
  /** Plays the provided Sample with a randomised pitch. Returns the SampleChannel that was used for playback. */
  playWithRandomPitch(sample: Sample | null, pitchVariation = Math.fround(0.2)): SampleChannel | null {
    const chan = sample?.getChannel() ?? null;
    if (chan === null)
      return null;

    chan.frequency.value = RNG.nextDouble(1 - pitchVariation, 1 + pitchVariation);
    chan.play();
    return chan;
  },
};
