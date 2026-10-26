// Ported from osu.Game/Graphics/Backgrounds/Triangles.cs (+ osu-resources Shaders/sh_TriangleBorder.fs)
// The DrawNode is a canvas (CanvasDrawable), as for TrianglesV2. With the border shader's thickness at 1 (fill) and a texel size of 0, each
// triangle is filled solid. Clamping a triangle's quad to the drawable (ClampAxes) is a clip of the drawable's bounds on the clamped axes.
// Each triangle's colour is DrawColourInfo.Colour (with the particle's colour applied) interpolated over its quad, applied as a vertical
// gradient between the quad's top and bottom centre.

import { BindableFloat } from '@fw/bindables/BindableNumber';
import { CanvasDrawable } from '@fw/graphics/CanvasDrawable';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo } from '@fw/graphics/ColourInfo';
import { Axes } from '@fw/layout/Enums';
import { Vector2 } from '@fw/layout/Vector2';
import { valueAt } from '@fw/transforms/Interpolation';
import { RNG } from '@fw/utils/RNG';

const triangle_size = 100;
const base_velocity = 50;

/** sqrt(3) / 2 */
const equilateral_triangle_ratio = Math.fround(0.866);

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
  /** The position of the top vertex of the triangle. */
  position: Vector2;

  /**
   * The colour shade of the triangle.
   * This is needed for colour recalculation of visible triangles when colourDark or colourLight is changed.
   */
  colourShade: number;

  /** The colour of the triangle. */
  colour: Colour4;

  /** The scale of the triangle. */
  scale: number;
}

export class Triangles extends CanvasDrawable {
  private _colourLight = Colour4.White;

  get colourLight(): Colour4 {
    return this._colourLight;
  }

  set colourLight(value: Colour4) {
    if (this._colourLight.equals(value)) return;

    this._colourLight = value;
    this.updateColours();
  }

  private _colourDark = Colour4.Black;

  get colourDark(): Colour4 {
    return this._colourDark;
  }

  set colourDark(value: Colour4) {
    if (this._colourDark.equals(value)) return;

    this._colourDark = value;
    this.updateColours();
  }

  /** Whether we should create new triangles as others expire. */
  protected get createNewTriangles(): boolean {
    return true;
  }

  /** The amount of triangles we want compared to the default distribution. */
  spawnRatio = 1;

  private readonly triangleScaleBindable = new BindableFloat(1);

  get triangleScale(): number {
    return this.triangleScaleBindable.value;
  }

  set triangleScale(value: number) {
    this.triangleScaleBindable.value = value;
  }

  /** Controls on which Axes the portion of triangles that falls within this Drawable's shape is drawn to the screen. Default is Axes.Both. */
  clampAxes = Axes.Both;

  /**
   * Whether we should drop-off alpha values of triangles more quickly to improve the visual appearance of fading. This defaults to on as it
   * is generally more aesthetically pleasing, but should be turned off in buffered containers.
   */
  hideAlphaDiscrepancies = true;

  /** The relative velocity of the triangles. Default is 1. */
  velocity = 1;

  private readonly parts: TriangleParticle[] = [];

  private stableRandom: SeededRandom | null = null;

  /**
   * Construct a new triangle visualisation.
   * seed: an optional seed to stabilise random positions / attributes. Note that this does not guarantee stable playback when seeking in time.
   */
  constructor(seed: number | null = null) {
    super();

    if (seed !== null)
      this.stableRandom = new SeededRandom(seed);
  }

  protected override loadComplete(): void {
    super.loadComplete();
    this.triangleScaleBindable.bindValueChanged(() => this.reset(), true);
  }

  protected override update(): void {
    super.update();

    const adjustedAlpha = this.hideAlphaDiscrepancies
      // Cubically scale alpha to make it drop off more sharply.
      ? Math.fround(Math.pow(this.drawColourInfo.colour.averageColour.a, 3))
      : 1;

    const elapsedSeconds = Math.fround(this.time.elapsed / 1000);

    if (elapsedSeconds === 0)
      return;

    // Since position is relative, the velocity needs to scale inversely with DrawHeight.
    // Since we will later multiply by the scale of individual triangles we normalize by
    // dividing by triangleScale.
    const movedDistance = -elapsedSeconds * this.velocity * base_velocity / (this.drawHeight * this.triangleScale);

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const particle = this.parts[i];

      // Scale moved distance by the size of the triangle. Smaller triangles should move more slowly.
      const newY = particle.position.y + Math.max(0.5, particle.scale) * movedDistance;
      const bottomY = newY + triangle_size * particle.scale * equilateral_triangle_ratio / this.drawHeight;

      if (bottomY < 0) {
        if (!this.createNewTriangles) {
          this.parts.splice(i, 1);
          continue;
        }

        particle.position = this.getRandomPosition(false, particle.scale);
      } else {
        particle.position = new Vector2(particle.position.x, newY);
      }

      particle.colour = particle.colour.opacity(adjustedAlpha);
    }

    this.invalidateDraw();
  }

  /**
   * Clears and re-initialises triangles according to a given seed.
   * seed: an optional seed to stabilise random positions / attributes. Note that this does not guarantee stable playback when seeking in time.
   */
  reset(seed: number | null = null): void {
    if (seed !== null)
      this.stableRandom = new SeededRandom(seed);

    this._aimCount = Math.trunc(Math.min(max_triangles, this.drawWidth * this.drawHeight * Math.fround(0.002) / (this.triangleScale * this.triangleScale) * this.spawnRatio));

    if (this.parts.length === this._aimCount) {
      for (const part of this.parts)
        part.position = this.getRandomPosition(true, part.scale);
    } else {
      this.parts.length = 0;

      for (let i = 0; i < this._aimCount; i++)
        this.parts.push(this.createTriangleAt(true));

      // drawn from largest to smallest such that the smaller triangles appear on top (TriangleParticle.CompareTo).
      this.parts.sort((a, b) => b.scale - a.scale);
    }

    this.invalidateDraw();
  }

  private _aimCount = 0;

  protected get aimCount(): number {
    return this._aimCount;
  }

  private createTriangleAt(randomY: boolean): TriangleParticle {
    const particle = this.createTriangle();

    particle.position = this.getRandomPosition(randomY, particle.scale);
    particle.colourShade = this.nextRandom();
    particle.colour = this.createTriangleShade(particle.colourShade);

    return particle;
  }

  private getRandomPosition(randomY: boolean, scale: number): Vector2 {
    let y = 1;

    if (randomY) {
      // since triangles are drawn from the top - allow them to be positioned a bit above the screen
      const maxOffset = triangle_size * scale * equilateral_triangle_ratio / this.drawHeight;
      y = valueAt(this.nextRandom(), -maxOffset, 1, 0, 1);
    }

    return new Vector2(this.nextRandom(), y);
  }

  /** Creates a triangle particle with a random scale. */
  protected createTriangle(): TriangleParticle {
    const std_dev = Math.fround(0.16);
    const mean = 0.5;

    const u1 = 1 - this.nextRandom(); //uniform(0,1] random floats
    const u2 = 1 - this.nextRandom();
    const randStdNormal = Math.fround(Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2)); // random normal(0,1)
    const scale = Math.max(this.triangleScale * (mean + std_dev * randStdNormal), 0.1); // random normal(mean,stdDev^2)

    return { position: Vector2.Zero, colourShade: 0, colour: Colour4.White, scale };
  }

  /** Creates a shade of colour for the triangles. */
  protected createTriangleShade(shade: number): Colour4 {
    return valueAt(shade, this._colourDark, this._colourLight, 0, 1);
  }

  private updateColours(): void {
    for (const part of this.parts)
      part.colour = this.createTriangleShade(part.colourShade);
  }

  private nextRandom(): number {
    return Math.fround(this.stableRandom?.nextDouble() ?? RNG.nextSingle());
  }

  protected override draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.parts.length === 0)
      return;

    const drawColour = this.drawColourInfo.colour;

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
      const triangleWidth = triangle_size * particle.scale;
      const triangleHeight = triangle_size * equilateral_triangle_ratio * particle.scale;

      const left = particle.position.x * width - triangleWidth * 0.5;
      const top = particle.position.y * height;

      // DrawColourInfo.Colour with the particle's colour applied, interpolated over the (clamped) quad, sampled at its top and bottom centre.
      const quadTop = clampY ? Math.min(Math.max(top, 0), height) : top;
      const quadBottom = clampY ? Math.min(Math.max(top + triangleHeight, 0), height) : top + triangleHeight;
      const centreX = Math.min(Math.max(particle.position.x, 0), 1);

      if (quadBottom <= quadTop)
        continue;

      const colour = drawColour.applyChild(ColourInfo.singleColour(particle.colour));

      const gradient = ctx.createLinearGradient(0, quadTop, 0, quadBottom);
      gradient.addColorStop(0, colour.interpolate(centreX, quadTop / height).toCss());
      gradient.addColorStop(1, colour.interpolate(centreX, quadBottom / height).toCss());
      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.moveTo(left + triangleWidth * 0.5, top);
      ctx.lineTo(left + triangleWidth, top + triangleHeight);
      ctx.lineTo(left, top + triangleHeight);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
