// Ported from osu.Framework/Audio/IHasAmplitudes.cs

import type { ChannelAmplitudes } from './track/ChannelAmplitudes';

export interface IHasAmplitudes {
  /**
   * Current amplitude of stereo channels where 1 is full volume and 0 is silent.
   * LeftChannel and RightChannel represent the maximum current amplitude of all of the left and right channels respectively.
   * The most recent values are returned. Synchronisation between channels should not be expected.
   */
  readonly currentAmplitudes: ChannelAmplitudes;
}
