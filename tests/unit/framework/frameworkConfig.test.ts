// AudioManager binds its volumes to FrameworkConfigManager (AudioManager.cs), so bindables bound to them adopt the settings' 0.01 precision.
// Without it, VolumeMeter's precise-scroll loop (which steps by the precision) never finished.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '@fw/audio/AudioManager';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { FrameworkConfigManager, FrameworkSetting } from '@fw/configuration/FrameworkConfigManager';
import { ResourceStore } from '@fw/io/ResourceStore';
import { AudioThread } from '@fw/platform/AudioThread';

function fakeNode(): AudioNode {
  const node = { connect: () => node, disconnect: () => {}, gain: { value: 1 }, pan: { value: 0 } };
  return node as unknown as AudioNode;
}

const context = { destination: fakeNode(), createGain: fakeNode, createStereoPanner: fakeNode } as unknown as BaseAudioContext;

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('FrameworkConfigManager', () => {
  it('gives the audio volumes their 0.01 precision', () => {
    vi.stubGlobal('AudioContext', class {});
    const config = new FrameworkConfigManager(localStorage);
    const audio = new AudioManager(new AudioThread(), new ResourceStore(), new ResourceStore(), config, context);

    const meter = new BindableDouble().with({ minValue: 0, maxValue: 1, precision: 0.01 });
    meter.bindTo(audio.volume);

    expect(meter.precision).toBe(0.01);
    expect(audio.volumeSample.precision).toBe(0.01);
    expect(audio.volumeTrack.precision).toBe(0.01);

    audio.volume.value = 0.5;
    expect(config.get<number>(FrameworkSetting.VolumeUniversal)).toBe(0.5);
  });
});
