// Ported from osu.Game/Graphics/ParticleSpewer.cs
// DOM: C# derives from Sprite and draws every particle as a textured quad in its DrawNode; here the spewer is a CanvasDrawable whose draw()
// is that DrawNode's Blit: the texture drawn per particle (additively, as the sprite's Additive blending), rotated about its centre. The
// spewer has no size, so subclasses declare the area their particles can reach as the canvas's drawOverflow. The canvas is released once
// no particle is left, as there may be long stretches without any.

import { BindableBool } from '@fw/bindables/Bindable';
import { CanvasDrawable } from '@fw/graphics/CanvasDrawable';
import { BlendingParameters } from '@fw/graphics/DrawInfo';
import type { Texture } from '@fw/graphics/textures/Texture';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';

export abstract class ParticleSpewer extends CanvasDrawable {
  private readonly particles: (FallingParticle | undefined)[];
  private currentIndex = 0;
  private lastParticleAdded: number | null = null;

  private readonly timeBetweenSpawns: number;
  private readonly maxDuration: number;

  /** Determines whether particles are being spawned. */
  readonly active = new BindableBool();

  override get isPresent(): boolean {
    return super.isPresent && this.hasActiveParticles;
  }

  protected get canSpawnParticles(): boolean {
    return true;
  }

  protected get particleGravity(): number {
    return 0;
  }

  private get hasActiveParticles(): boolean {
    return this.active.value || (this.lastParticleAdded !== null && this.lastParticleAdded + this.maxDuration > this.time.current);
  }

  protected constructor(texture: Texture | null, perSecond: number, maxDuration: number) {
    super();

    this.texture = texture;
    this.blending = BlendingParameters.Additive;

    this.particles = new Array(perSecond * Math.ceil(maxDuration / 1000));

    this.timeBetweenSpawns = Math.fround(1000 / perSecond);
    this.maxDuration = maxDuration;
  }

  private _texture: Texture | null = null;
  private image: HTMLImageElement | null = null;

  get texture(): Texture | null {
    return this._texture;
  }

  set texture(value: Texture | null) {
    if (value === this._texture)
      return;

    this._texture = value;
    this.image = null;

    if (value?.url) {
      const image = new Image();
      image.src = value.url;
      void image.decode().then(() => {
        if (this._texture === value)
          this.image = image;
      }, () => {});
    }
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.active.bindValueChanged(active => {
      // ensure that particles can be spawned immediately after the spewer becomes active.
      if (active.newValue)
        this.lastParticleAdded = null;
    });
  }

  protected override update(): void {
    super.update();

    this.invalidateDraw();

    if (!this.active.value || !this.canSpawnParticles)
      return;

    if (this.lastParticleAdded === null) {
      this.lastParticleAdded = this.time.current;
      this.spawnParticle();
      return;
    }

    const timeElapsed = this.time.current - this.lastParticleAdded;

    // Avoid spawning too many particles if a long amount of time has passed.
    if (Math.abs(timeElapsed) > this.maxDuration) {
      this.lastParticleAdded = this.time.current;
      this.spawnParticle();
      return;
    }

    for (let i = 0; i < timeElapsed / this.timeBetweenSpawns; i++) {
      this.lastParticleAdded += this.timeBetweenSpawns;
      this.spawnParticle();
    }
  }

  private spawnParticle(): void {
    const newParticle = this.createParticle();

    newParticle.startTime = Math.fround(this.lastParticleAdded!);

    this.particles[this.currentIndex] = newParticle;

    this.currentIndex = (this.currentIndex + 1) % this.particles.length;
  }

  /** Called each time a new particle should be spawned. */
  protected createParticle(): FallingParticle {
    return new FallingParticle();
  }

  // #region DrawNode (ParticleSpewerDrawNode.Blit)

  protected override draw(ctx: CanvasRenderingContext2D): void {
    const texture = this._texture;
    const image = this.image;
    if (texture === null || image === null)
      return;

    const currentTime = Math.fround(this.time.current);
    const gravity = this.particleGravity;
    const maxDuration = this.maxDuration;
    const sourceSize = this.drawSize;
    const colour = this.drawColourInfo.colour.averageColour;

    ctx.globalCompositeOperation = 'lighter';

    let drawn = 0;

    for (const p of this.particles) {
      if (p === undefined || p.duration === 0)
        continue;

      const timeSinceStart = currentTime - p.startTime;

      // ignore particles from the future.
      // these can appear when seeking in replays.
      if (timeSinceStart < 0) continue;

      const alpha = p.alphaAtTime(timeSinceStart);
      if (alpha <= 0) continue;

      const pos = p.positionAtTime(timeSinceStart, gravity, maxDuration);
      const scale = p.scaleAtTime(timeSinceStart);
      const angle = p.angleAtTime(timeSinceStart);

      // createDrawRect
      const width = texture.displayWidth * scale;
      const height = texture.displayHeight * scale;
      const x = (this.relativePositionAxes & Axes.X) !== 0 ? pos.x * sourceSize.x : pos.x;
      const y = (this.relativePositionAxes & Axes.Y) !== 0 ? pos.y * sourceSize.y : pos.y;

      // (transformPosition rotates each corner about the rect's centre by -angle in canvas terms)
      ctx.save();
      ctx.globalAlpha = colour.a * alpha;
      ctx.translate(x, y);
      ctx.rotate(-angle);
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
      ctx.restore();

      drawn++;
    }

    ctx.globalCompositeOperation = 'source-over';

    if (drawn === 0 && !this.active.value)
      this.releaseCanvas();
  }

  // #endregion
}

export class FallingParticle {
  startTime = 0;
  startPosition = Vector2.Zero;
  velocity = Vector2.Zero;
  duration = 0;
  startAngle = 0;
  endAngle = 0;
  endScale = 0;

  alphaAtTime(timeSinceStart: number): number {
    return 1 - this.progressAtTime(timeSinceStart);
  }

  scaleAtTime(timeSinceStart: number): number {
    return 1 + (this.endScale - 1) * this.progressAtTime(timeSinceStart);
  }

  angleAtTime(timeSinceStart: number): number {
    return this.startAngle + (this.endAngle - this.startAngle) * this.progressAtTime(timeSinceStart);
  }

  positionAtTime(timeSinceStart: number, gravity: number, maxDuration: number): Vector2 {
    const progress = this.progressAtTime(timeSinceStart);
    const currentGravity = gravity * this.duration / maxDuration * progress;

    return new Vector2(
      this.startPosition.x + this.velocity.x * timeSinceStart / maxDuration,
      this.startPosition.y + (this.velocity.y + currentGravity) * timeSinceStart / maxDuration);
  }

  private progressAtTime(timeSinceStart: number): number {
    return Math.min(Math.max(timeSinceStart / this.duration, 0), 1);
  }
}
