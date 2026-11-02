// Ported from osu.Game/Screens/Menu/StarFountain.cs
// (C# derives from SkinReloadableDrawable to take the texture from the current skin; there is no skinning here, so the spewer always uses
// the default Menu/fountain-star texture.)

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { CompositeDrawable } from '@fw/graphics/containers/CompositeDrawable';
import { TextureStore } from '@fw/graphics/textures/TextureStore';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import type { ScheduledDelegate } from '@fw/timing/Scheduler';
import { RNG } from '@fw/utils/RNG';
import { FallingParticle, ParticleSpewer } from '../../graphics/ParticleSpewer';

export class StarFountain extends CompositeDrawable {
  private spewer!: StarFountainSpewer;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.internalChild = this.spewer = this.createSpewer();

    return r;
  }

  protected createSpewer(): StarFountainSpewer {
    return new StarFountainSpewer();
  }

  shoot(direction: number): void {
    this.spewer.shoot(direction);
  }
}

const particle_duration_min = 300;
const particle_duration_max = 1000;

/**
 * DOM: where the particles can reach around the emitter, for the canvas (see ParticleSpewer). Over at most particle_duration_max ms: x within
 * ±(500 + 60), y from the start at +50 up to 50 − 1500²/3200 ≈ −653 (velocity −1400 ± 100, gravity 800), plus half the star's diagonal at
 * its largest scale (2.6 × 23.7).
 */
const particle_reach = MarginPadding.of({ left: 630, right: 630, top: 720, bottom: 80 });

export class StarFountainSpewer extends ParticleSpewer {
  private lastShootTime: number | null = null;

  private _lastShootDirection = 0;

  protected get lastShootDirection(): number {
    return this._lastShootDirection;
  }

  protected override get particleGravity(): number {
    return 800;
  }

  protected get shootDuration(): number {
    return 800;
  }

  constructor(perSecond = 240) {
    super(null, perSecond, particle_duration_max);
  }

  protected override get drawOverflow(): MarginPadding {
    return particle_reach;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    void dependencies.resolve(TextureStore).get('Menu/fountain-star').then(t => this.texture = t);

    return r;
  }

  protected override createParticle(): FallingParticle {
    const p = new FallingParticle();
    p.startPosition = new Vector2(0, 50);
    p.duration = RNG.nextSingle(particle_duration_min, particle_duration_max);
    p.startAngle = getRandomVariance(4);
    p.endAngle = getRandomVariance(2);
    p.endScale = Math.fround(2.2 + getRandomVariance(0.4));
    p.velocity = new Vector2(this.getCurrentAngle(), Math.fround(-1400 + getRandomVariance(100)));
    return p;
  }

  protected getCurrentAngle(): number {
    const x_velocity_random_variance = 60;
    const x_velocity_from_direction = 500;

    return Math.fround(this.lastShootDirection * x_velocity_from_direction * Math.fround(1 - 2 * (this.clock!.currentTime - this.lastShootTime!) / this.shootDuration)
      + getRandomVariance(x_velocity_random_variance));
  }

  private deactivateDelegate: ScheduledDelegate | null = null;

  shoot(direction: number): void {
    this.active.value = true;

    this.deactivateDelegate?.cancel();
    this.deactivateDelegate = this.scheduler.addDelayed(() => this.active.value = false, this.shootDuration);

    this.lastShootTime = this.clock!.currentTime;
    this._lastShootDirection = direction;
  }
}

function getRandomVariance(variance: number): number {
  return RNG.nextSingle(-variance, variance);
}
