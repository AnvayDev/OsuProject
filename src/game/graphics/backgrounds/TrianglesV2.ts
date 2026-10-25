// Ported from osu.Game/Graphics/Backgrounds/TrianglesV2.cs (+ osu-resources Shaders/sh_TriangleBorder.fs)
// The DrawNode is a canvas (CanvasDrawable). The border shader is reproduced geometrically: in the triangle's normalised texture space the
// border is the band within `thickness` of the bottom edge and of the two sides (distances measured in that space, as the shader does), whose
// inner edge is the triangle apex (0.5, √5·t), corners (φ·t, 1 − t) and (1 − φ·t, 1 − t); outer minus inner is filled with the even-odd
// rule. Clamping a triangle's quad to the drawable (ClampAxes) is a clip of the drawable's bounds on the clamped axes. Each triangle's
// colour is DrawColourInfo.Colour interpolated over its quad, applied as a vertical gradient between the quad's top and bottom centre.

import { BindableFloat } from '@fw/bindables/BindableNumber';
import { CanvasDrawable } from '@fw/graphics/CanvasDrawable';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { RNG } from '@fw/utils/RNG';

const triangle_size = 100;
const base_velocity = 50;
const equilateral_triangle_ratio = Math.fround(0.866);

// Inner-edge factors of the border band (see header): √5 and the golden ratio φ = (1 + √5) / 2 follow from the side line's unit normal.
const sqrt5 = Math.sqrt(5);
const phi = (1 + sqrt5) / 2;

/** Limited by the maximum size of QuadVertexBuffer for safety (ushort.MaxValue / (IRenderer.VERTICES_PER_QUAD + 2)). */
const max_triangles = Math.trunc(65535 / (4 + 2));

/** A deterministic System.Random stand-in for seeded triangles (a different generator than .NET's, but stable per seed). */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  nextDouble(): number {
    // mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export interface TriangleParticle {
  /** The position of the top vertex of the triangle (relative). */
  position: Vector2;

  /** The speed multiplier of the triangle. */
  speedMultiplier: number;
}

export class TrianglesV2 extends CanvasDrawable {
  /** If true, the triangles' outline thickness. 0.02 by default. */
  thickness = Math.fround(0.02); // No need for invalidation since it's happening in Update()

  /** Whether we should create new triangles as others expire. */
  protected get createNewTriangles(): boolean {
    return true;
  }

  /** Controls on which Axes triangles are clamped to this container's bounds. */
  clampAxes = Axes.Both;

  scaleAdjust = 1;

  private readonly spawnRatioBindable = new BindableFloat(1);

  /** The amount of triangles we want compared to the default distribution. */
  get spawnRatio(): number {
    return this.spawnRatioBindable.value;
  }

  set spawnRatio(value: number) {
    this.spawnRatioBindable.value = value;
  }

  /** The relative velocity of the triangles. Default is 1. */
  velocity = 1;

  private readonly parts: TriangleParticle[] = [];

  private stableRandom: SeededRandom | null = null;

  /** Construct a new triangle visualisation. seed: if provided, use a deterministic random number generator for the triangles. */
  constructor(seed: number | null = null) {
    super();

    if (seed !== null)
      this.stableRandom = new SeededRandom(seed);
  }

  protected override loadComplete(): void {
    super.loadComplete();

    this.spawnRatioBindable.bindValueChanged(() => this.reset(), true);
  }

  protected override update(): void {
    super.update();

    if (this.createNewTriangles)
      this.addTriangles(false);

    const elapsedSeconds = Math.fround(this.time.elapsed / 1000);

    if (elapsedSeconds === 0)
      return;

    // Since position is relative, the velocity needs to scale inversely with DrawHeight.
    const movedDistance = -elapsedSeconds * this.velocity * base_velocity / this.drawHeight;

    for (let i = 0; i < this.parts.length; i++) {
      const particle = this.parts[i];
      particle.position = new Vector2(particle.position.x, particle.position.y + Math.max(0.5, particle.speedMultiplier) * movedDistance);

      const bottomPos = particle.position.y + triangle_size * this.scaleAdjust * equilateral_triangle_ratio / this.drawHeight;

      // (C# removes while iterating forward without adjusting the index, so the following particle skips one frame of movement.)
      if (bottomPos < 0)
        this.parts.splice(i, 1);
    }

    this.invalidateDraw();
  }

  /** Clears and re-initialises triangles according to a given seed. */
  reset(seed: number | null = null): void {
    if (seed !== null)
      this.stableRandom = new SeededRandom(seed);

    this.parts.length = 0;
    this.addTriangles(true);
  }

  private _aimCount = 0;

  protected get aimCount(): number {
    return this._aimCount;
  }

  private addTriangles(randomY: boolean): void {
    this._aimCount = Math.trunc(Math.min(Math.max(this.drawWidth * 0.02 * this.spawnRatio, 1), max_triangles));

    const currentCount = this.parts.length;

    if (this._aimCount - currentCount === 0)
      return;

    for (let i = 0; i < this._aimCount - currentCount; i++)
      this.parts.push(this.createTriangleAt(randomY));

    this.invalidateDraw();
  }

  private createTriangleAt(randomY: boolean): TriangleParticle {
    const particle = this.createTriangle();

    let y = 1;

    if (randomY) {
      // since triangles are drawn from the top - allow them to be positioned a bit above the screen
      const maxOffset = triangle_size * this.scaleAdjust * equilateral_triangle_ratio / this.drawHeight;
      y = -maxOffset + this.nextRandom() * (1 + maxOffset);
    }

    particle.position = new Vector2(this.nextRandom(), y);
    return particle;
  }

  /** Creates a triangle particle with a random speed multiplier. */
  protected createTriangle(): TriangleParticle {
    const std_dev = Math.fround(0.16);
    const mean = 0.5;

    const u1 = 1 - this.nextRandom(); //uniform(0,1] random floats
    const u2 = 1 - this.nextRandom();
    const randStdNormal = Math.fround(Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2)); // random normal(0,1)
    const speedMultiplier = Math.max(mean + std_dev * randStdNormal, 0.1); // random normal(mean,stdDev^2)

    return { position: Vector2.Zero, speedMultiplier };
  }

  private nextRandom(): number {
    return Math.fround(this.stableRandom?.nextDouble() ?? RNG.nextSingle());
  }

  protected override draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this._aimCount === 0 || this.thickness === 0)
      return;

    const colour = this.drawColourInfo.colour;
    const triangleWidth = triangle_size * this.scaleAdjust;
    const triangleHeight = triangle_size * this.scaleAdjust * equilateral_triangle_ratio;

    const t = this.thickness;

    ctx.save();

    // getClampedQuad: clamping each quad to [0, 1] on the clamped axes is the same as clipping to the drawable's bounds on those axes.
    const clampX = (this.clampAxes & Axes.X) !== 0;
    const clampY = (this.clampAxes & Axes.Y) !== 0;
    if (clampX || clampY) {
      ctx.beginPath();
      ctx.rect(clampX ? 0 : -1e6, clampY ? 0 : -1e6, clampX ? width : 2e6, clampY ? height : 2e6);
      ctx.clip();
    }

    for (const particle of this.parts) {
      const left = particle.position.x * width - triangleWidth * 0.5;
      const top = particle.position.y * height;

      // DrawColourInfo.Colour.Interpolate(triangleQuad), sampled at the (clamped) quad's top and bottom centre.
      const quadTop = clampY ? Math.min(Math.max(top, 0), height) : top;
      const quadBottom = clampY ? Math.min(Math.max(top + triangleHeight, 0), height) : top + triangleHeight;
      const centreX = Math.min(Math.max(particle.position.x, 0), 1);

      if (quadBottom <= quadTop)
        continue;

      const gradient = ctx.createLinearGradient(0, quadTop, 0, quadBottom);
      gradient.addColorStop(0, colour.interpolate(centreX, quadTop / height).toCss());
      gradient.addColorStop(1, colour.interpolate(centreX, quadBottom / height).toCss());
      ctx.fillStyle = gradient;

      const point = (u: number, v: number): [number, number] => [left + u * triangleWidth, top + v * triangleHeight];

      ctx.beginPath();

      // Outer triangle (apex at the top).
      ctx.moveTo(...point(0.5, 0));
      ctx.lineTo(...point(1, 1));
      ctx.lineTo(...point(0, 1));
      ctx.closePath();

      // Inner edge of the border band.
      if (sqrt5 * t < 1 - t) {
        ctx.moveTo(...point(0.5, sqrt5 * t));
        ctx.lineTo(...point(phi * t, 1 - t));
        ctx.lineTo(...point(1 - phi * t, 1 - t));
        ctx.closePath();
      }

      ctx.fill('evenodd');
    }

    ctx.restore();
  }
}
