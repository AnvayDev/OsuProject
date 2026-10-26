// Ported from osu.Framework/Audio/Mixing/AudioMixer.cs and IAudioChannel.cs, with BassAudioMixer's channel routing as Web Audio nodes:
// a channel's output node connects to the mixer's input node. Effects run as a chain of Web Audio nodes between the input and the
// destination, ordered like BASS DSP/FX priorities (higher priority first). Only BASS's BiQuad filter (BQFParameters) has a node mapping.

import { AudioComponent } from '../AudioComponent';
import { createEffectNode, type IEffectParameter, updateEffectNode } from './Effects';

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
  private readonly activeEffects = new Map<IEffectParameter, { node: AudioNode; priority: number; order: number }>();

  private effectOrder = 0;

  constructor(readonly context: BaseAudioContext, private readonly destination: AudioNode, private readonly fallbackMixer: AudioMixer | null, readonly identifier: string) {
    super();

    this.input = context.createGain();
    this.input.connect(destination);
  }

  addEffect(effect: IEffectParameter, priority = 0): void {
    if (this.activeEffects.has(effect))
      return;

    this.activeEffects.set(effect, { node: createEffectNode(this.context, effect), priority, order: this.effectOrder++ });
    this.reconnectEffects();
  }

  removeEffect(effect: IEffectParameter): void {
    const active = this.activeEffects.get(effect);
    if (active === undefined)
      return;

    this.activeEffects.delete(effect);
    active.node.disconnect();
    this.reconnectEffects();
  }

  updateEffect(effect: IEffectParameter): void {
    const active = this.activeEffects.get(effect);
    if (active === undefined)
      return;

    updateEffectNode(active.node, effect);
  }

  private reconnectEffects(): void {
    const chain = [...this.activeEffects.values()].sort((a, b) => b.priority - a.priority || a.order - b.order).map(e => e.node);

    this.input.disconnect();
    for (const node of chain)
      node.disconnect();

    let previous: AudioNode = this.input;

    for (const node of chain) {
      previous.connect(node);
      previous = node;
    }

    previous.connect(this.destination);
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
