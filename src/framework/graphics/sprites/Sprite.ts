// Ported from osu.Framework/Graphics/Sprites/Sprite.cs
// DOM: the texture is the element's background (sized by DrawTextureRectangle). DrawColourInfo is applied exactly like the
// texture shader's `v_Colour * texel`: white keeps the texture, uniform grey uses brightness(), other colours multiply (background-blend-mode: multiply,
// masked by the texture's own alpha), and alpha becomes the leaf element's opacity. An alpha gradient (e.g. a cover fading in from one side)
// becomes a gradient mask layer instead.

import { Axes, Invalidation } from '../../layout/Enums';
import { RectangleF } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import type { Colour4 } from '../Colour4';
import type { ColourInfo } from '../ColourInfo';
import { Drawable } from '../Drawable';
import type { Renderer } from '../rendering/Renderer';
import { Texture } from '../textures/Texture';

const isWhiteRGB = (c: Colour4) => c.r === 1 && c.g === 1 && c.b === 1;
const rgb = (c: Colour4) => `rgb(${c.r * 255},${c.g * 255},${c.b * 255})`;

/** CSS gradient for a 4-corner colour (exact for horizontal/vertical gradients, which is what osu! uses). */
export function colourInfoToCss(c: ColourInfo, alphaInColour: boolean): string {
  const col = (x: Colour4) => alphaInColour ? x.toCss() : rgb(x);

  if (c.hasSingleColour)
    return col(c.topLeft);

  if (c.topLeft.equals(c.topRight) && c.bottomLeft.equals(c.bottomRight))
    return `linear-gradient(to bottom, ${col(c.topLeft)}, ${col(c.bottomLeft)})`;

  if (c.topLeft.equals(c.bottomLeft) && c.topRight.equals(c.bottomRight))
    return `linear-gradient(to right, ${col(c.topLeft)}, ${col(c.topRight)})`;

  // General bilinear: average the vertical gradients of both columns.
  return `linear-gradient(to bottom, ${col(c.interpolate(0.5, 0))}, ${col(c.interpolate(0.5, 1))})`;
}

/** A mask layer applying a non-uniform alpha (null when the alpha is uniform). */
function alphaGradientMask(c: ColourInfo): string | null {
  const { topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br } = c;

  if (tl.a === tr.a && tl.a === bl.a && tl.a === br.a)
    return null;

  const a = (x: number) => `rgba(0,0,0,${x})`;

  if (tl.a === tr.a && bl.a === br.a)
    return `linear-gradient(to bottom, ${a(tl.a)}, ${a(bl.a)})`;

  if (tl.a === bl.a && tr.a === br.a)
    return `linear-gradient(to right, ${a(tl.a)}, ${a(tr.a)})`;

  return `linear-gradient(to bottom, ${a((tl.a + tr.a) / 2)}, ${a((bl.a + br.a) / 2)})`;
}

/** A sprite that displays its texture. */
export class Sprite extends Drawable {
  private _textureRectangle = new RectangleF(0, 0, 1, 1);

  /** Determines which part of the texture is drawn (relative to the texture's size along textureRelativeSizeAxes). */
  get textureRectangle(): RectangleF {
    return this._textureRectangle;
  }

  set textureRectangle(value: RectangleF) {
    if (this._textureRectangle.equals(value))
      return;

    this._textureRectangle = value;
    this.invalidate(Invalidation.DrawNode);
  }

  private _textureRelativeSizeAxes = Axes.Both;

  /** Whether textureRectangle is relative to the draw size along each axis. */
  get textureRelativeSizeAxes(): Axes {
    return this._textureRelativeSizeAxes;
  }

  set textureRelativeSizeAxes(value: Axes) {
    if (this._textureRelativeSizeAxes === value)
      return;

    this._textureRelativeSizeAxes = value;
    this.invalidate(Invalidation.DrawNode);
  }

  /** Absolutely sized texture rectangle in local space. */
  get drawTextureRectangle(): RectangleF {
    let { x, y, width, height } = this.textureRectangle;

    if (this.textureRelativeSizeAxes !== Axes.None) {
      const drawSize = this.drawSize;

      if ((this.textureRelativeSizeAxes & Axes.X) > 0) {
        x *= drawSize.x;
        width *= drawSize.x;
      }

      if ((this.textureRelativeSizeAxes & Axes.Y) > 0) {
        y *= drawSize.y;
        height *= drawSize.y;
      }
    }

    return new RectangleF(x, y, width, height);
  }

  static readonly MAX_EDGE_SMOOTHNESS = 3;

  private _edgeSmoothness = Vector2.Zero;

  /** Smoothness of the sprite's edges (anti-aliasing). The browser always anti-aliases transformed edges, so this only validates input. */
  get edgeSmoothness(): Vector2 {
    return this._edgeSmoothness;
  }

  set edgeSmoothness(value: Vector2) {
    if (this._edgeSmoothness.equals(value))
      return;

    if (value.x > Sprite.MAX_EDGE_SMOOTHNESS || value.y > Sprite.MAX_EDGE_SMOOTHNESS)
      throw new Error(`May not smooth more than ${Sprite.MAX_EDGE_SMOOTHNESS} or will leak neighboring textures in atlas. Tried to smooth by (${value.x}, ${value.y}).`);

    this._edgeSmoothness = value;
    this.invalidate(Invalidation.DrawInfo);
  }

  private _texture: Texture | null = null;

  /** The texture that this sprite should draw. If textureRelativeSizeAxes is set, the drawable will be resized to the texture's display size when its size is zero. */
  get texture(): Texture | null {
    return this._texture;
  }

  set texture(value: Texture | null) {
    if (value === this._texture)
      return;

    this._texture?.dispose();
    this._texture = value;

    let width: number;
    let height: number;

    if ((this.textureRelativeSizeAxes & Axes.X) > 0)
      width = (this._texture?.width ?? 1) / this.textureRectangle.width;
    else
      width = this.textureRectangle.width;

    if ((this.textureRelativeSizeAxes & Axes.Y) > 0)
      height = (this._texture?.height ?? 1) / this.textureRectangle.height;
    else
      height = this.textureRectangle.height;

    this.fillAspectRatio = width / height;

    this.invalidate(Invalidation.DrawNode);

    if (this.size.equals(Vector2.Zero))
      this.size = new Vector2(this._texture?.displayWidth ?? 0, this._texture?.displayHeight ?? 0);
  }

  /** The amount the draw rectangle is inflated by for edgeSmoothness, in local space (Sprite.InflationAmount; one pixel is 1/pixelRatio). */
  private inflationAmount(pixelRatio: number): Vector2 {
    const scale = this.drawInfo.matrixInverse.extractScale();
    return new Vector2(scale.x * this._edgeSmoothness.x / pixelRatio, scale.y * this._edgeSmoothness.y / pixelRatio);
  }

  /** Puts the texture's image behind the canvas where this sprite is now (Renderer, Underlays). */
  private placeUnderlay(renderer: Renderer, texture: Texture, blur: number): void {
    const quad = this.screenSpaceDrawQuad;
    const drawSize = this.drawSize;

    // TextureCoords = DrawRectangle.RelativeIn(DrawTextureRectangle), as a fraction of the texture
    const t = this.drawTextureRectangle;

    renderer.placeUnderlay(
      this, texture.url!, texture.width, texture.height, quad.topLeft, quad.topRight, quad.bottomLeft,
      -t.x / t.width, -t.y / t.height, (drawSize.x - t.x) / t.width, (drawSize.y - t.y) / t.height, blur);
  }

  /** TexturedShaderDrawNode.BindTextureShader: binds the sprite's shader (TextureShader) with its uniforms. */
  protected bindTextureShader(renderer: Renderer): void {
    renderer.bindShader(renderer.textureShader);
  }

  /** SpriteDrawNode.Draw + Blit */
  override draw(renderer: Renderer): void {
    super.draw(renderer);

    const texture = this._texture;

    if (texture === null)
      return;

    const drawSize = this.drawSize;

    if (drawSize.x === 0 || drawSize.y === 0)
      return;

    this.bindTextureShader(renderer);

    const smooth = this._edgeSmoothness.x !== 0 || this._edgeSmoothness.y !== 0;
    const r = this._textureRectangle;
    const wholeTexture = this._textureRelativeSizeAxes === Axes.Both && r.x === 0 && r.y === 0 && r.width === 1 && r.height === 1;

    // An image the renderer may not upload is shown behind the canvas, through a hole (Renderer, Underlays).
    const underlay = texture.image === null && !texture.isWhitePixel;

    if (!smooth && wholeTexture && !underlay) {
      // (the common case: TextureCoords is the whole texture and nothing is inflated)
      if (renderer.bindTexture(texture))
        renderer.drawQuadUV(this.screenSpaceDrawQuad, this.drawColourInfo.colour, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0);

      return;
    }

    let quad = this.screenSpaceDrawQuad;
    let inflationPercentage: Vector2 | null = null;

    if (smooth) {
      // Sprite.ComputeScreenSpaceDrawQuad: the quad is inflated by the smoothing range, which the shader blends out.
      const inflation = this.inflationAmount(renderer.pixelRatio);
      quad = this.toScreenSpaceRect(this.drawRectangle.inflate(inflation));
      inflationPercentage = new Vector2(inflation.x / drawSize.x, inflation.y / drawSize.y);
    }

    // TextureCoords = DrawRectangle.RelativeIn(DrawTextureRectangle) * texture display size
    const t = this.drawTextureRectangle;
    const textureCoords = new RectangleF(
      -t.x / t.width * texture.displayWidth, -t.y / t.height * texture.displayHeight,
      drawSize.x / t.width * texture.displayWidth, drawSize.y / t.height * texture.displayHeight);

    if (underlay) {
      const colour = this.drawColourInfo.colour;
      const average = colour.averageColour;
      const holeQuad = quad;
      const holeInflation = inflationPercentage;

      renderer.drawUnderlay(
        blur => this.placeUnderlay(renderer, texture, blur), colour, (average.r + average.g + average.b) / 3,
        c => renderer.drawQuad(Texture.WhitePixel, holeQuad, c, null, holeInflation));

      return;
    }

    renderer.drawQuad(texture, quad, this.drawColourInfo.colour, null, inflationPercentage, null, textureCoords);
  }

  private lastBackground = '';
  private readonly appliedCss: Record<string, string> = {};

  protected override applyElementState(): void {
    super.applyElementState();

    const colour = this.drawColourInfo.colour;
    const tex = this._texture;

    let css: Record<string, string>;

    if (tex === null) {
      css = { background: '', opacity: '' };
    } else if (tex.isWhitePixel) {
      css = { background: colourInfoToCss(colour, true), opacity: '' };
    } else {
      const r = this.drawTextureRectangle;
      const size = `${r.width}px ${r.height}px`;
      const pos = `${r.x}px ${r.y}px`;
      const url = `url("${tex.url}")`;
      const single = colour.tryExtractSingleColour();
      const alphaMask = alphaGradientMask(colour);
      const alpha = alphaMask !== null ? 1 : single !== null ? single.a : colour.averageColour.a;

      const whiteRGB = single !== null ? isWhiteRGB(single) : [colour.topLeft, colour.topRight, colour.bottomLeft, colour.bottomRight].every(isWhiteRGB);

      if (whiteRGB) {
        css = { background: `${url} ${pos} / ${size} no-repeat`, backgroundBlendMode: '', mask: alphaMask ?? '', opacity: `${alpha}` };
      } else if (single !== null && single.r === single.g && single.g === single.b) {
        // Menu dimming must not use the remote texture as a mask: masks require CORS even when the image itself can be displayed.
        // brightness() multiplies RGB while preserving the texture's alpha, without loading a second image.
        css = { background: `${url} ${pos} / ${size} no-repeat`, filter: `brightness(${single.r})`, opacity: `${alpha}` };
      } else {
        const textureMask = `${url} ${pos} / ${size} no-repeat`;

        css = {
          background: `${textureMask}, ${colourInfoToCss(colour, false)}`,
          backgroundBlendMode: 'multiply',
          mask: alphaMask !== null ? `${textureMask}, ${alphaMask}` : textureMask,
          maskComposite: alphaMask !== null ? 'intersect' : '',
          opacity: `${alpha}`,
        };
      }
    }

    const key = JSON.stringify(css);
    if (key === this.lastBackground)
      return;

    this.lastBackground = key;
    // Fades change opacity without changing the image or mask. Rewriting those shorthands can
    // restart image/mask painting, so cache each property independently of the whole draw state.
    const properties: Record<string, string> = {
      background: css.background,
      'background-blend-mode': css.backgroundBlendMode ?? '',
      mask: css.mask ?? '',
      '-webkit-mask': css.mask ?? '',
      'mask-composite': css.maskComposite ?? '',
      '-webkit-mask-composite': css.maskComposite ? 'source-in' : '',
      opacity: css.opacity,
      filter: css.filter ?? '',
    };
    const maskChanged = this.appliedCss.mask !== properties.mask;
    for (const [property, value] of Object.entries(properties)) {
      // A mask shorthand resets its composite mode even when that mode's value is unchanged.
      this.setElementStyle(property, value, maskChanged && property.endsWith('mask-composite'));
    }
  }

  /**
   * Writes a style property of the element unless the last value written through here is the same (or force is set). Returns whether it
   * was written. Subclasses drawing more than the texture (e.g. CircularProgress's mask) write through here too, so either side sees the
   * other's writes.
   */
  protected setElementStyle(property: string, value: string, force = false): boolean {
    if (this.appliedCss[property] === value && !force)
      return false;

    this.element.style.setProperty(property, value);
    this.appliedCss[property] = value;
    return true;
  }

  override toString(): string {
    let result = super.toString();

    if (this._texture?.assetName)
      result += ` tex: ${this._texture.assetName}`;

    return result;
  }

  protected override disposeInternal(isDisposing: boolean): void {
    this._texture?.dispose();
    this._texture = null;

    super.disposeInternal(isDisposing);
  }
}
