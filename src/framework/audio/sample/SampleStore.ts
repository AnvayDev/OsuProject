// Ported from osu.Framework/Audio/Sample/SampleStore.cs (and ISampleStore.cs). get() is asynchronous: it resolves once the sample is decoded.

import { AdjustableAudioComponent } from '../AudioComponent';
import { AudioCollectionManager } from '../AudioCollectionManager';
import type { AudioMixer } from '../mixing/AudioMixer';
import { type IResourceStore, ResourceStore } from '../../io/ResourceStore';
import { Sample } from './Sample';
import { SampleWebFactory } from './SampleWeb';

export class SampleStore extends AudioCollectionManager<AdjustableAudioComponent> {
  private readonly store: ResourceStore<Blob>;

  private readonly factories = new Map<string, Promise<SampleWebFactory | null>>();

  /** How many instances of a single sample should be allowed to playback concurrently before stopping the longest playing. */
  playbackConcurrency = Sample.DEFAULT_CONCURRENCY;

  /** @internal */
  constructor(store: IResourceStore<Blob>, private readonly mixer: AudioMixer) {
    super();

    this.store = new ResourceStore(store);

    this.addExtension('wav');
    this.addExtension('mp3');
  }

  addExtension(extension: string): void {
    this.store.addExtension(extension);
  }

  /** Retrieves a sample by name (decoded and ready to play), or null if it doesn't exist. */
  async get(name: string | null): Promise<Sample | null> {
    if (this.isDisposed)
      throw new Error(`Cannot access a disposed ${this.constructor.name}.`);

    if (!name) return null;

    let factory = this.factories.get(name);

    if (factory === undefined) {
      factory = this.store.get(name).then(async data => {
        if (data === null)
          return null;

        const f = new SampleWebFactory(data, name, this.mixer);
        f.playbackConcurrency.value = this.playbackConcurrency;
        this.addItem(f);
        await f.loaded;
        return f;
      });

      this.factories.set(name, factory);
      void factory.then(f => { if (this.factories.get(name) === factory) this.loadedFactories.set(name, f); });
    }

    return (await factory)?.createSample() ?? null;
  }

  /** The factories that have finished loading (null: the resource doesn't exist), for getSync. */
  private readonly loadedFactories = new Map<string, SampleWebFactory | null>();

  /**
   * C#'s synchronous Get, for callers that must not wait (skin sample lookups made while a hit object is applied): the sample if it has
   * been loaded through get() or preload(), else null. A sample that exists but has not been loaded yet starts loading and is returned
   * by a later call.
   */
  getSync(name: string | null): Sample | null {
    if (!name) return null;

    const factory = this.loadedFactories.get(name);

    if (factory === undefined) {
      void this.get(name);
      return null;
    }

    return factory?.createSample() ?? null;
  }

  /** Loads samples ahead of use, so that getSync finds them. Names that don't exist are remembered as missing. */
  async preload(names: Iterable<string>): Promise<void> {
    await Promise.all([...names].map(name => this.get(name)));
  }

  invalidate(name: string): void {
    const factory = this.factories.get(name);
    this.factories.delete(name);
    this.loadedFactories.delete(name);
    void factory?.then(f => { if (f !== null) this.removeItem(f); });
  }

  getAvailableResources(): readonly string[] {
    return this.store.getAvailableResources();
  }
}
