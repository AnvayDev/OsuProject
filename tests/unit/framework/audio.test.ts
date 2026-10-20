import { describe, expect, it } from 'vitest';
import { bassFft512, peakLevel } from '@fw/audio/AmplitudeProcessor';
import { AdjustableAudioComponent, AdjustableProperty } from '@fw/audio/AudioComponent';
import { AudioCollectionManager } from '@fw/audio/AudioCollectionManager';
import { TrackVirtual } from '@fw/audio/track/TrackVirtual';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { NamespacedResourceStore, ResourceStore, type IResourceStore } from '@fw/io/ResourceStore';

const sine = (amp: number, bin: number) => Float32Array.from({ length: 512 }, (_, n) => amp * Math.sin(2 * Math.PI * bin * n / 512));

describe('BASS amplitude formulas (measured against libbass 2.4)', () => {
  it('FFT512: a full-scale sine at a bin centre reads 1.0 with 0.5 neighbours (periodic Hann, 4/N)', () => {
    const out = new Float32Array(256);
    bassFft512(sine(1, 32), out);
    expect(out[32]).toBeCloseTo(1, 6);
    expect(out[31]).toBeCloseTo(0.5, 6);
    expect(out[33]).toBeCloseTo(0.5, 6);
    expect(out[40]).toBeCloseTo(0, 6);

    bassFft512(sine(0.5, 32), out);
    expect(out[32]).toBeCloseTo(0.5, 6);
  });

  it('FFT512: DC uses 2/N and leaks into bin 1', () => {
    const out = new Float32Array(256);
    bassFft512(new Float32Array(512).fill(0.5), out);
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
    expect(out[2]).toBeCloseTo(0, 6);
  });

  it('level is the peak |x| of the last 1/60 s', () => {
    const data = Float32Array.from({ length: 1024 }, (_, i) => (i < 200 ? 0.9 : 0.3) * Math.sin(i));
    expect(peakLevel(data, 735)).toBeCloseTo(0.3, 2);
    expect(peakLevel(data, 1024)).toBeCloseTo(0.9, 2);
  });
});

describe('Audio adjustments', () => {
  it('aggregates volume multiplicatively and balance additively through bound components', () => {
    const manager = new AudioCollectionManager<AdjustableAudioComponent>();
    const item = new AdjustableAudioComponent();
    manager.addItem(item);

    manager.volume.value = 0.5;
    item.volume.value = 0.5;
    expect(item.aggregateVolume.value).toBe(0.25);

    const extra = new BindableDouble(0.5);
    item.addAdjustment(AdjustableProperty.Volume, extra);
    expect(item.aggregateVolume.value).toBe(0.125);

    manager.balance.value = 0.25;
    item.balance.value = 0.5;
    expect(item.aggregateBalance.value).toBe(0.75);

    item.removeAllAdjustments(AdjustableProperty.Volume);
    expect(item.aggregateVolume.value).toBe(0.5);

    manager.removeItem(item);
    expect(item.aggregateBalance.value).toBe(0.5);
  });

  it('removes dead items on update', () => {
    const manager = new AudioCollectionManager<AdjustableAudioComponent>();
    const item = new AdjustableAudioComponent();
    manager.addItem(item);
    item.dispose();
    manager.update(); // runs the item's queued disposal
    manager.update(); // removes the now-dead item
    expect(manager.items).toEqual([]);
    expect(item.isDisposed).toBe(true);
  });
});

describe('TrackVirtual', () => {
  it('runs on a stopwatch, clamps seeks and completes at its length', async () => {
    const track = new TrackVirtual(50);
    let completed = 0;
    track.completed.add(() => completed++);

    expect(track.seek(-10)).toBe(false);
    expect(track.seek(10)).toBe(true);
    expect(track.currentTime).toBe(10);

    track.start();
    expect(track.isRunning).toBe(true);
    await new Promise(r => setTimeout(r, 60));
    track.update();
    expect(track.currentTime).toBe(50);
    expect(track.isRunning).toBe(false);
    expect(completed).toBe(1);
  });

  it('follows the aggregate rate', () => {
    const track = new TrackVirtual(1000);
    track.tempo.value = 2;
    track.frequency.value = 1.5;
    expect(track.rate).toBe(3);
  });
});

describe('ResourceStore', () => {
  class MapStore implements IResourceStore<string> {
    readonly requests: string[] = [];
    constructor(private readonly files: Record<string, string>) {}
    async get(name: string) { this.requests.push(name); return this.files[name] ?? null; }
    getAvailableResources() { return Object.keys(this.files); }
  }

  it('tries the name, then each extension, per store in order', async () => {
    const inner = new MapStore({ 'Samples/UI/click.wav': 'wav', 'Samples/UI/hover.mp3': 'mp3' });
    const store = new ResourceStore(new NamespacedResourceStore(inner, 'Samples'));
    store.addExtension('wav');
    store.addExtension('.mp3');

    expect(await store.get('UI/click')).toBe('wav');
    expect(await store.get('UI/hover')).toBe('mp3');
    expect(inner.requests.slice(-3)).toEqual(['Samples/UI/hover', 'Samples/UI/hover.wav', 'Samples/UI/hover.mp3']);
    expect(await store.get('UI/missing')).toBeNull();
    expect(new NamespacedResourceStore(inner, 'Samples').getAvailableResources()).toEqual(['UI/click.wav', 'UI/hover.mp3']);
  });
});
