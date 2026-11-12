// Ported from osu.Framework/Graphics/Audio/DrawableSample.cs
// DrawableAudioMixer is not ported, so there is no parent mixer to move playing channels to (OnMixerChanged is omitted).

import { Bindable } from '../../bindables/Bindable';
import { Sample } from '../../audio/sample/Sample';
import type { SampleChannel } from '../../audio/sample/SampleChannel';
import { DrawableAudioWrapper } from './DrawableAudioWrapper';

/** A Sample wrapper to allow insertion in the draw hierarchy to allow transforms, lifetime management etc. */
export class DrawableSample extends DrawableAudioWrapper {
  /**
   * @param sample The audio sample to wrap.
   * @param disposeSampleOnDisposal Whether the sample should be automatically disposed on drawable disposal/expiry.
   */
  constructor(private readonly sample: Sample, disposeSampleOnDisposal = true) {
    super(sample, disposeSampleOnDisposal);

    this.name = sample.name;

    this.playbackConcurrency.bindTo(sample.playbackConcurrency);
  }

  play(): SampleChannel {
    const channel = this.getChannel();
    channel.play();
    return channel;
  }

  getChannel(): SampleChannel {
    return this.sample.getChannel();
  }

  get length(): number {
    return this.sample.length;
  }

  readonly playbackConcurrency = new Bindable<number>(Sample.DEFAULT_CONCURRENCY);
}
