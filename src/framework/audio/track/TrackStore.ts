// Ported from osu.Framework/Audio/Track/TrackStore.cs (and ITrackStore.cs). get() is asynchronous: resources are fetched.

import { AdjustableAudioComponent } from '../AudioComponent';
import { AudioCollectionManager } from '../AudioCollectionManager';
import type { AudioMixer } from '../mixing/AudioMixer';
import { type IResourceStore, ResourceStore } from '../../io/ResourceStore';
import type { Track } from './Track';
import { TrackVirtual } from './TrackVirtual';
import { TrackWeb } from './TrackWeb';

export class TrackStore extends AudioCollectionManager<AdjustableAudioComponent> {
  /** @internal */
  constructor(private readonly store: IResourceStore<Blob>, private readonly mixer: AudioMixer) {
    super();

    if (store instanceof ResourceStore)
      store.addExtension('mp3');
  }

  /** Retrieves a virtual track that can be used as a substitute for a real track. */
  getVirtual(length = Number.POSITIVE_INFINITY, name = 'virtual'): Track {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    const track = new TrackVirtual(length, name);
    this.addItem(track);
    return track;
  }

  /** Retrieves a track by name, or null if it doesn't exist. */
  async get(name: string | null): Promise<Track | null> {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    if (!name) return null;

    const data = await this.store.get(name);

    if (data === null)
      return null;

    const track = new TrackWeb(data, name);

    this.mixer.add(track);
    this.addItem(track);

    return track;
  }

  getAvailableResources(): readonly string[] {
    return this.store.getAvailableResources();
  }
}
