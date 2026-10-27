// BeatSyncedContainer against osu.Game/Graphics/Containers/BeatSyncedContainer.cs: beat indices from the provider's timing points while its
// clock runs, the default 1000 ms beat on the container's own clock otherwise, early activation, and the provider DI key.

import { describe, expect, it } from 'vitest';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import { Container } from '@fw/graphics/containers/Container';
import { Vector2 } from '@fw/layout/Vector2';
import { ManualClock } from '@fw/timing/FramedClock';
import type { IClock } from '@fw/timing/IClock';
import { ControlPointInfo } from '@game/beatmaps/controlPoints/ControlPointInfo';
import type { EffectControlPoint } from '@game/beatmaps/controlPoints/EffectControlPoint';
import { TimingControlPoint } from '@game/beatmaps/controlPoints/TimingControlPoint';
import { IBeatSyncProvider } from '@game/beatmaps/IBeatSyncProvider';
import { BeatSyncedContainer } from '@game/graphics/containers/BeatSyncedContainer';
import { TestClock } from '../framework/testHost';

class TestProvider extends IBeatSyncProvider {
  readonly trackClock = new ManualClock();
  controlPointInfo: ControlPointInfo | null = null;

  get controlPoints() { return this.controlPointInfo; }
  get clock(): IClock { return this.trackClock; }
  get currentAmplitudes() { return ChannelAmplitudes.Empty; }
}

class TestBeatContainer extends BeatSyncedContainer {
  readonly beats: { index: number; beatLength: number }[] = [];

  setEarly(ms: number) { this.earlyActivationMilliseconds = ms; }

  protected override onNewBeat(beatIndex: number, timingPoint: TimingControlPoint, _effectPoint: EffectControlPoint) {
    this.beats.push({ index: beatIndex, beatLength: timingPoint.beatLength });
  }
}

function setup() {
  const provider = new TestProvider();
  const clock = new TestClock();
  const deps = new DependencyContainer();
  deps.cacheAs(IBeatSyncProvider, provider);

  const root = new Container().with({ size: new Vector2(100) });
  root.clock = clock;
  root.loadDrawable(clock, deps);

  const container = new TestBeatContainer();
  root.add(container);

  const frame = (ms: number, trackMs = ms) => {
    clock.elapsedFrameTime = ms;
    clock.currentTime += ms;
    if (provider.trackClock.isRunning) provider.trackClock.currentTime += trackMs;
    root.updateSubTree();
  };

  return { provider, container, frame };
}

function timing(time: number, beatLength: number): ControlPointInfo {
  const info = new ControlPointInfo();
  const point = new TimingControlPoint();
  point.beatLengthBindable.value = beatLength;
  info.add(time, point);
  return info;
}

describe('BeatSyncedContainer', () => {
  it('fires once per beat of the provider timing point while the track runs', () => {
    const { provider, container, frame } = setup();
    provider.controlPointInfo = timing(0, 500);
    provider.trackClock.isRunning = true;

    frame(0);
    for (let i = 0; i < 125; i++) frame(10);

    expect(container.beats.map(b => b.index)).toEqual([0, 1, 2]);
    expect(container.beats.every(b => b.beatLength === 500)).toBe(true);
  });

  it('beats before the first timing point are off by one less (index -1 just before it)', () => {
    const { provider, container, frame } = setup();
    provider.controlPointInfo = timing(1000, 500);
    provider.trackClock.isRunning = true;
    provider.trackClock.currentTime = 900;

    frame(0, 0);
    // (900 - 1000) / 500 truncates to 0, then -1 because the time is before the timing point.
    expect(container.beats.at(-1)!.index).toBe(-1);
  });

  it('falls back to the default 1000 ms beat on its own clock when the track is stopped', () => {
    const { provider, container, frame } = setup();
    provider.controlPointInfo = timing(0, 500);

    frame(0);
    for (let i = 0; i < 250; i++) frame(10);

    expect(container.beats.map(b => b.index)).toEqual([0, 1, 2]);
    expect(container.beats.every(b => b.beatLength === TimingControlPoint.DEFAULT.beatLength)).toBe(true);
  });

  it('fires earlyActivationMilliseconds before the beat', () => {
    const { provider, container, frame } = setup();
    provider.controlPointInfo = timing(0, 500);
    provider.trackClock.isRunning = true;
    // (early activation is scaled by trackRate / drawableRate, so a rate-0 ManualClock would cancel it.)
    provider.trackClock.rate = 1;
    container.setEarly(100);

    frame(0);
    for (let i = 0; i < 39; i++) frame(10);
    expect(container.beats.map(b => b.index)).toEqual([0]);

    // Track time 400 + 100 early reaches beat 1.
    frame(10);
    expect(container.beats.map(b => b.index)).toEqual([0, 1]);
  });
});
