// TrianglesV2 (osu.Game/Graphics/Backgrounds/TrianglesV2.cs) and LogoVisualisation (osu.Game/Screens/Menu/LogoVisualisation.cs):
// triangle count, movement and expiry, and the visualiser's amplitude sampling (index rotation, kiai multiplier) and decay.

import { describe, expect, it } from 'vitest';
import { DependencyContainer } from '@fw/allocation/DependencyContainer';
import { ChannelAmplitudes } from '@fw/audio/track/ChannelAmplitudes';
import { Container } from '@fw/graphics/containers/Container';
import { Vector2 } from '@fw/layout/Vector2';
import { ManualClock } from '@fw/timing/FramedClock';
import type { IClock } from '@fw/timing/IClock';
import { ControlPointInfo } from '@game/beatmaps/controlPoints/ControlPointInfo';
import { EffectControlPoint } from '@game/beatmaps/controlPoints/EffectControlPoint';
import { IBeatSyncProvider } from '@game/beatmaps/IBeatSyncProvider';
import { TrianglesV2 } from '@game/graphics/backgrounds/TrianglesV2';
import { LogoVisualisation } from '@game/screens/menu/LogoVisualisation';
import { TestClock } from '../framework/testHost';

class TestProvider extends IBeatSyncProvider {
  readonly trackClock = new ManualClock();
  controlPointInfo: ControlPointInfo | null = null;
  amplitudes = ChannelAmplitudes.Empty;

  get controlPoints() { return this.controlPointInfo; }
  get clock(): IClock { return this.trackClock; }
  get currentAmplitudes() { return this.amplitudes; }
}

function setup(width = 500, height = 400) {
  const provider = new TestProvider();
  const clock = new TestClock();
  const deps = new DependencyContainer();
  deps.cacheAs(IBeatSyncProvider, provider);

  const root = new Container().with({ size: new Vector2(width, height) });
  root.clock = clock;
  root.loadDrawable(clock, deps);

  const frame = (ms: number) => {
    clock.elapsedFrameTime = ms;
    clock.currentTime += ms;
    root.updateSubTree();
  };

  return { provider, root, frame };
}

type Parts = { position: Vector2; speedMultiplier: number }[];

describe('TrianglesV2', () => {
  it('keeps DrawWidth * 0.02 * SpawnRatio triangles, spread over the height on reset', () => {
    const { root, frame } = setup();
    const triangles = new TrianglesV2(1).with({ size: new Vector2(500, 400) });
    root.add(triangles);
    frame(0);

    const parts = (triangles as unknown as { parts: Parts }).parts;
    expect(parts).toHaveLength(10);
    expect(parts.some(p => p.position.y < 1)).toBe(true);

    triangles.spawnRatio = 2;
    frame(0);
    expect(parts).toHaveLength(20);
  });

  it('moves triangles up by velocity * 50 * max(0.5, speed) / DrawHeight per second and replaces expired ones at the bottom', () => {
    const { root, frame } = setup();
    const triangles = new TrianglesV2(2).with({ size: new Vector2(500, 400) });
    root.add(triangles);
    frame(0);

    const parts = (triangles as unknown as { parts: Parts }).parts;
    const first = parts[0];
    const startY = first.position.y;

    frame(1000);
    if (parts.includes(first))
      expect(first.position.y).toBeCloseTo(startY - Math.max(0.5, first.speedMultiplier) * 50 / 400, 5);

    // After enough time every original triangle has left through the top; new ones spawn at y = 1.
    for (let i = 0; i < 100; i++) frame(1000);
    expect(parts).toHaveLength(10);
    expect(parts.every(p => p.position.y <= 1)).toBe(true);
  });
});

describe('LogoVisualisation', () => {
  it('samples amplitudes every 50 ms, rotating the index by 5 and halving outside kiai', () => {
    const { provider, root, frame } = setup();
    const amplitudes = new Float32Array(256);
    amplitudes[0] = 1;
    provider.amplitudes = new ChannelAmplitudes(0, 0, amplitudes);

    const vis = new LogoVisualisation();
    root.add(vis);
    frame(0);

    const bars = (vis as unknown as { frequencyAmplitudes: Float32Array }).frequencyAmplitudes;

    // The scheduled update runs before Update() in the same frame, so a bar is sampled and then decayed by 50 * 0.0024 * (amp + 0.03).
    const decayed = (a: number) => a - 50 * 0.0024 * (a + 0.03);

    frame(50);
    // Bar i takes amplitude (i + indexOffset) % 200; the first update uses offset 0.
    expect(bars[0]).toBeCloseTo(decayed(0.5), 4);

    // The next update uses offset 5, so amplitude 0 lands on bar 195, while bar 0 keeps decaying.
    frame(50);
    expect(bars[0]).toBeCloseTo(decayed(decayed(0.5)), 4);
    expect(bars[195]).toBeCloseTo(decayed(0.5), 4);
  });

  it('uses the full amplitude in kiai time', () => {
    const { provider, root, frame } = setup();
    const amplitudes = new Float32Array(256);
    amplitudes[0] = 0.8;
    provider.amplitudes = new ChannelAmplitudes(0, 0, amplitudes);

    const info = new ControlPointInfo();
    const effect = new EffectControlPoint();
    effect.kiaiModeBindable.value = true;
    info.add(0, effect);
    provider.controlPointInfo = info;
    provider.trackClock.isRunning = true;

    const vis = new LogoVisualisation();
    root.add(vis);
    frame(0);
    frame(50);

    const bars = (vis as unknown as { frequencyAmplitudes: Float32Array }).frequencyAmplitudes;
    expect(bars[0]).toBeCloseTo(0.8 - 50 * 0.0024 * 0.83, 4);
  });

  it('decays bars to zero', () => {
    const { provider, root, frame } = setup();
    const amplitudes = new Float32Array(256);
    amplitudes[0] = 1;
    provider.amplitudes = new ChannelAmplitudes(0, 0, amplitudes);

    const vis = new LogoVisualisation();
    root.add(vis);
    frame(0);
    frame(50);

    provider.amplitudes = ChannelAmplitudes.Empty;
    for (let i = 0; i < 100; i++) frame(16);

    const bars = (vis as unknown as { frequencyAmplitudes: Float32Array }).frequencyAmplitudes;
    expect(Array.from(bars).every(b => b === 0)).toBe(true);
  });
});
