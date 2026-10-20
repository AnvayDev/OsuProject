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
    }

    return (await factory)?.createSample() ?? null;
  }

  invalidate(name: string): void {
    const factory = this.factories.get(name);
    this.factories.delete(name);
    void factory?.then(f => { if (f !== null) this.removeItem(f); });
  }

  getAvailableResources(): readonly string[] {
    return this.store.getAvailableResources();
  }
}
