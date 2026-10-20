// Ported from osu.Framework/Audio/Mixing/AudioMixer.cs and IAudioChannel.cs, with BassAudioMixer's channel routing as Web Audio nodes:
// a channel's output node connects to the mixer's input node. Effects (AddEffect/RemoveEffect/UpdateEffect) are not ported yet.

import { AudioComponent } from '../AudioComponent';

export interface IAudioChannel {
  readonly name: string;

  /** @internal */
  mixer: AudioMixer | null;

  /** @internal The node carrying this channel's (post-volume) output into its mixer. */
  readonly output: AudioNode | null;

  /** @internal Called once the channel's mixer (and so its audio context) is known, to build its node graph. */
  attachToContext(context: BaseAudioContext): void;
}

/** Mixes IAudioChannels together. */
export class AudioMixer extends AudioComponent {
  /** The node channels are mixed into. */
  readonly input: GainNode;

  /** fallbackMixer: a mixer to which channels removed from this one are returned (null for a default mixer, from which removal is prevented). */
  constructor(readonly context: BaseAudioContext, destination: AudioNode, private readonly fallbackMixer: AudioMixer | null, readonly identifier: string) {
    super();

    this.input = context.createGain();
    this.input.connect(destination);
  }

  /** Adds a channel to the mix. */
  add(channel: IAudioChannel): void {
    if (channel.mixer === this)
      return;

    // Ensure the channel is removed from its current mixer.
    channel.mixer?.removeChannel(channel, false);

    this.addInternal(channel);

    channel.mixer = this;
  }

  /** Removes a channel from the mix. */
  remove(channel: IAudioChannel): void {
    this.removeChannel(channel, true);
  }

  protected removeChannel(channel: IAudioChannel, returnToDefault: boolean): void {
    // If this is the default mixer, prevent removal.
    if (returnToDefault && this.fallbackMixer === null)
      return;

    if (channel.mixer !== this)
      return;

    this.removeInternal(channel);
    channel.mixer = null;

    // Add the channel back to the default mixer so audio can always be played.
    if (returnToDefault)
      this.fallbackMixer!.add(channel);
  }

  protected addInternal(channel: IAudioChannel): void {
    channel.attachToContext(this.context);
    channel.output?.connect(this.input);
  }

  protected removeInternal(channel: IAudioChannel): void {
    channel.output?.disconnect(this.input);
  }
}
