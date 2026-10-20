// Ported from osu.Framework/Audio/Sample/Sample.cs (and ISample.cs)

import { Bindable } from '../../bindables/Bindable';
import { AudioCollectionManager } from '../AudioCollectionManager';
import type { SampleChannel } from './SampleChannel';

export abstract class Sample extends AudioCollectionManager<SampleChannel> {
  static readonly DEFAULT_CONCURRENCY = 2;

  protected constructor(readonly name: string) {
    super();
  }

  /** The length in milliseconds of this sample. */
  abstract get length(): number;

  /**
   * The number of times this sample (as identified by name) can be played back concurrently.
   * Note: with the channel flags osu!framework uses (BASS_SAMCHAN_STREAM | DECODE), BASS does not enforce this (measured), so neither does this port.
   */
  readonly playbackConcurrency = new Bindable<number>(Sample.DEFAULT_CONCURRENCY);

  /** @internal */
  onPlay: ((sample: Sample) => void) | null = null;

  /** Creates a new unique playback of this sample and starts it. */
  play(): SampleChannel {
    const channel = this.getChannel();
    channel.play();
    return channel;
  }

  /** Retrieves a unique SampleChannel for this sample, which can be played back on its own. */
  getChannel(): SampleChannel {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    const channel = this.createChannel();
    channel.onPlay = c => this.onChannelPlay(c);
    return channel;
  }

  private onChannelPlay(channel: SampleChannel): void {
    this.addItem(channel);
    this.onPlay?.(this);
  }

  override get isAlive(): boolean {
    return super.isAlive && (this.pendingActions.length > 0 || this.items.length > 0);
  }

  protected abstract createChannel(): SampleChannel;

  protected override itemRemoved(item: SampleChannel): void {
    super.itemRemoved(item);

    // SampleChannels are removed when they're no longer playing (see SampleChannel.IsAlive).
    // They need to be disposed at this point when automatic cleanup is requested (the default).

    if (!item.isDisposed && !item.manualFree) {
      item.dispose();
      item.update();
    }
  }
}
