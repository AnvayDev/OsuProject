import { describe, expect, it } from 'vitest';
import { Vector2 } from '@fw/layout/Vector2';
import { FallingParticle } from '@game/graphics/ParticleSpewer';

// docs/spec/main-menu.md §9.2: p = clamp(a / Duration, 0, 1); alpha = 1 − p; scale = lerp(1, EndScale, p); angle = lerp(StartAngle, EndAngle, p);
// pos = StartPosition + (Velocity + (0, gravity × Duration / maxDuration × p)) × a / maxDuration.
describe('FallingParticle (ParticleSpewer)', () => {
  const particle = () => {
    const p = new FallingParticle();
    p.startPosition = new Vector2(0, 50);
    p.velocity = new Vector2(100, -1400);
    p.duration = 500;
    p.startAngle = 2;
    p.endAngle = -1;
    p.endScale = 2.2;
    return p;
  };

  it('fades, grows and turns over its duration', () => {
    const p = particle();
    expect(p.alphaAtTime(250)).toBeCloseTo(0.5);
    expect(p.scaleAtTime(250)).toBeCloseTo(1.6);
    expect(p.angleAtTime(250)).toBeCloseTo(0.5);
    expect(p.alphaAtTime(600)).toBe(0);
  });

  it('moves with its velocity and falls with gravity scaled by its duration', () => {
    const pos = particle().positionAtTime(250, 800, 1000);
    expect(pos.x).toBeCloseTo(25);
    expect(pos.y).toBeCloseTo(50 + (-1400 + 800 * 0.5 * 0.5) * 0.25);
  });
});
