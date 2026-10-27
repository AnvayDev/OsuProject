// Ported from osu.Framework/Audio/AudioManager.cs. Device management does not apply in the browser: one AudioContext plays to the default output.
// Browsers start an AudioContext suspended until the first user gesture, so it is resumed on the first pointer/key input.

import { type FrameworkConfigManager, FrameworkSetting } from '../configuration/FrameworkConfigManager';
import type { AudioThread } from '../platform/AudioThread';
import { BindableDouble } from '../bindables/BindableNumber';
import type { IResourceStore } from '../io/ResourceStore';
import { AdjustableProperty, type AudioComponent } from './AudioComponent';
import { AudioCollectionManager } from './AudioCollectionManager';
import { AudioMixer } from './mixing/AudioMixer';
import { SampleStore } from './sample/SampleStore';
import { TrackStore } from './track/TrackStore';

let userMixerID = 0;

export class AudioManager extends AudioCollectionManager<AudioComponent> {
  /** The global mixer which all tracks are routed into by default. */
  readonly trackMixer: AudioMixer;

  /** The global mixer which all samples are routed into by default. */
  readonly sampleMixer: AudioMixer;

  /** Volume of all samples played game-wide. */
  readonly volumeSample = new BindableDouble(1).with({ minValue: 0, maxValue: 1 });

  /** Volume of all tracks played game-wide. */
  readonly volumeTrack = new BindableDouble(1).with({ minValue: 0, maxValue: 1 });

  private globalTrackStore: TrackStore | null = null;
  private globalSampleStore: SampleStore | null = null;

  /** The manager component responsible for audio tracks (e.g. songs). */
  get tracks(): TrackStore {
    if (this.globalTrackStore === null) {
      const store = this.globalTrackStore = new TrackStore(this.trackStore, this.trackMixer);
      this.addItem(store);
      store.addAdjustment(AdjustableProperty.Volume, this.volumeTrack);
    }

    return this.globalTrackStore;
  }

  /** The manager component responsible for audio samples (e.g. sound effects). */
  get samples(): SampleStore {
    if (this.globalSampleStore === null) {
      const store = this.globalSampleStore = new SampleStore(this.sampleStore, this.sampleMixer);
      this.addItem(store);
      store.addAdjustment(AdjustableProperty.Volume, this.volumeSample);
    }

    return this.globalSampleStore;
  }

  constructor(
    private readonly thread: AudioThread,
    private readonly trackStore: IResourceStore<Blob>,
    private readonly sampleStore: IResourceStore<Blob>,
    config: FrameworkConfigManager | null = null,
    readonly context: BaseAudioContext = new AudioContext(),
  ) {
    super();

    thread.registerManager(this);

    if (config !== null) {
      // attach config bindables
      config.bindWith(FrameworkSetting.VolumeUniversal, this.volume);
      config.bindWith(FrameworkSetting.VolumeEffect, this.volumeSample);
      config.bindWith(FrameworkSetting.VolumeMusic, this.volumeTrack);
    }

    this.addItem(this.trackMixer = this.createMixer(null, 'TrackMixer'));
    this.addItem(this.sampleMixer = this.createMixer(null, 'SampleMixer'));

    if (context instanceof AudioContext && context.state === 'suspended')
      resumeOnUserGesture(context);
  }

  protected override onDispose(disposing: boolean): void {
    this.thread.unregisterManager(this);

    super.onDispose(disposing);
  }

  /** Creates a new AudioMixer (routed into the default output; channels removed from it return to the SampleMixer). */
  createAudioMixer(identifier: string | null = null): AudioMixer {
    return this.createMixer(this.sampleMixer, identifier ? identifier : `user #${++userMixerID}`);
  }

  private createMixer(fallbackMixer: AudioMixer | null, identifier: string): AudioMixer {
    const mixer = new AudioMixer(this.context, this.context.destination, fallbackMixer, identifier);
    this.addItem(mixer);
    return mixer;
  }

  /** Obtains the TrackStore backing a given IResourceStore (or the global store if none is given). */
  getTrackStore(store: IResourceStore<Blob> | null = null, mixer: AudioMixer | null = null): TrackStore {
    if (store === null) return this.tracks;

    const tm = new TrackStore(store, mixer ?? this.trackMixer);
    this.tracks.addItem(tm);
    return tm;
  }

  /** Obtains the SampleStore backing a given IResourceStore (or the global store if none is given). */
  getSampleStore(store: IResourceStore<Blob> | null = null, mixer: AudioMixer | null = null): SampleStore {
    if (store === null) return this.samples;

    const sm = new SampleStore(store, mixer ?? this.sampleMixer);
    this.samples.addItem(sm);
    return sm;
  }
}

function resumeOnUserGesture(context: AudioContext): void {
  const events = ['pointerdown', 'keydown', 'touchend'] as const;

  const resume = () => {
    void context.resume().then(() => {
      if (context.state === 'running')
        for (const e of events) window.removeEventListener(e, resume, true);
    });
  };

  for (const e of events)
    window.addEventListener(e, resume, true);
}
