// Ported from osu.Framework/Audio/Track/TrackStore.cs (and ITrackStore.cs). get() is asynchronous: resources are fetched (getSync() hands out the
// track first).

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

  /**
   * C#'s synchronous Get(name), for callers that already know the resource exists (BeatmapManagerWorkingBeatmap resolves files from the
   * in-memory set). The data arrives asynchronously: the track loads once it does, and fails if the store returns nothing.
   */
  getSync(name: string): Track {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    const track = new TrackWeb(this.store.get(name), name);

    this.mixer.add(track);
    this.addItem(track);

    return track;
  }

  /**
   * Web: a track streamed by the media element straight from a cross-origin URL that sends no CORS headers (so it can't be fetched), bypassing
   * the store and Web Audio (see TrackWeb). It fails if the URL can't be played.
   */
  getStreamed(url: string): Track {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    const track = new TrackWeb(url, url);

    this.mixer.add(track);
    this.addItem(track);

    return track;
  }

  getAvailableResources(): readonly string[] {
    return this.store.getAvailableResources();
  }
}
