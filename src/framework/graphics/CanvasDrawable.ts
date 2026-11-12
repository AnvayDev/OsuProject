// Not a port: the DOM counterpart of a Drawable with a custom DrawNode (osu.Framework/Graphics/DrawNode.cs), for procedural leaf drawing
// (TrianglesV2, LogoVisualisation). The element holds a <canvas> covering the draw rectangle at screen resolution (draw size × screen-space
// scale × devicePixelRatio). Like a DrawNode, it draws in ApplyState (applyElementState) whenever the drawable is invalidated with
// Invalidation.DrawNode, in local draw-space units, with the drawable's DrawColourInfo (which already carries every ancestor's colour and alpha).
// The canvas may extend past the draw rectangle (drawOverflow), as a DrawNode isn't clipped to its drawable; a drawable without size (e.g. a
// particle emitter) then draws in the overflow area only.

import { Invalidation } from '../layout/Enums';
import { MarginPadding } from '../layout/MarginPadding';
import { RectangleF } from '../layout/Primitives';
import { Colour4 } from './Colour4';
import { ColourInfo } from './ColourInfo';
import { Drawable } from './Drawable';
import type { Renderer } from './rendering/Renderer';

const resolution_headroom = 1.1;

const no_overflow = new MarginPadding();

const white = ColourInfo.singleColour(Colour4.White);

export abstract class CanvasDrawable extends Drawable {
  // (createElement runs inside the Drawable constructor, before this class's fields are defined, so the canvas is read from the element.)
  private get canvas(): HTMLCanvasElement {
    return this.element.firstChild as HTMLCanvasElement;
  }

  private contextBacking: CanvasRenderingContext2D | null | undefined;

  /** Whether the canvas has been sized by a draw (since it was created or released). */
  private allocated = false;
  private appliedOverflow: MarginPadding = no_overflow;

  protected override createElement(): HTMLElement {
    const el = super.createElement();

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    el.appendChild(canvas);

    return el;
  }

  /**
   * How far (in draw-space units) drawing may extend outside the draw rectangle on each side. A DrawNode is not clipped to its drawable's
   * bounds, so drawables that draw outside them (e.g. visualiser bars) need the canvas enlarged by this much.
   */
  protected get drawOverflow(): MarginPadding {
    return no_overflow;
  }

  /** Frees the canvas's backing store (e.g. while there is nothing to draw); the next draw allocates it again. */
  protected releaseCanvas(): void {
    this.canvas.width = this.canvas.height = 0;
    this.allocated = false;
  }

  /** Requests a redraw on the next element validation (DrawNode invalidation). */
  protected invalidateDraw(): void {
    this.invalidate(Invalidation.DrawNode);
  }

  // (the canvas resolution / blur scale follows the on-screen scale)
  protected override get elementStateUsesScreenSpace(): boolean {
    return true;
  }

  protected override applyElementState(): void {
    super.applyElementState();

    this.renderCanvas();
  }

  // #region DrawNode (Renderer)

  private static nextTextureID = 0;
  private readonly textureKey = `canvas:${CanvasDrawable.nextTextureID++}`;

  private renderedInvalidationID = 0;
  private renderedBy: Renderer | null = null;
  private rendered = false;

  /**
   * The canvas is drawn as a texture: redrawn and uploaded whenever the drawable was invalidated, then shown on the quad of the draw
   * rectangle with its overflow. The picture already carries the draw colour, so the quad is white.
   */
  override draw(renderer: Renderer): void {
    super.draw(renderer);

    if (this.renderedInvalidationID !== this.invalidationID || this.renderedBy !== renderer) {
      this.renderedInvalidationID = this.invalidationID;
      this.renderedBy = renderer;

      this.rendered = this.renderCanvas() && this.allocated;

      if (this.rendered)
        renderer.updateImage(this.textureKey, this.canvas);
    }

    // (nothing to show: no size, or the subclass released the canvas)
    if (!this.rendered || !renderer.bindImage(this.textureKey, null))
      return;

    const size = this.drawSize;
    const overflow = this.drawOverflow;

    renderer.bindShader(renderer.textureShader);
    renderer.drawQuadUV(
      this.toScreenSpaceRect(new RectangleF(-overflow.left, -overflow.top, size.x + overflow.totalHorizontal, size.y + overflow.totalVertical)),
      white, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0);
  }

  protected override disposeInternal(isDisposing: boolean): void {
    this.renderedBy?.deleteImage(this.textureKey);
    this.renderedBy = null;

    super.disposeInternal(isDisposing);
  }

  // #endregion

  /** Sizes the canvas for the current on-screen scale and draws it. Returns false if there is nothing to draw on. */
  private renderCanvas(): boolean {
    const canvas = this.canvas;
    const ctx = this.contextBacking === undefined ? (this.contextBacking = canvas.getContext('2d')) : this.contextBacking;
    if (ctx === null)
      return false;

    const size = this.drawSize;
    const overflow = this.drawOverflow;
    const totalWidth = size.x + overflow.totalHorizontal;
    const totalHeight = size.y + overflow.totalVertical;

    if (size.x < 0 || size.y < 0 || totalWidth <= 0 || totalHeight <= 0)
      return false;

    // Pixels per draw-space unit on screen (from the DrawInfo matrix when there is no draw rectangle to measure).
    const ratio = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    let scale: number;

    if (size.x > 0 && size.y > 0) {
      const quad = this.screenSpaceDrawQuad;
      scale = Math.max(quad.width / size.x, quad.height / size.y, 1e-3) * ratio;
    } else {
      const m = this.drawInfo.matrix;
      scale = Math.max(Math.hypot(m.m11, m.m12), Math.hypot(m.m21, m.m22), 1e-3) * ratio;
    }

    const requiredWidth = Math.max(1, Math.ceil(totalWidth * scale));
    const requiredHeight = Math.max(1, Math.ceil(totalHeight * scale));

    // Resizing a canvas reallocates (and clears) its backing store. The first allocation is exact, as most canvases keep their scale. Animated
    // scales (e.g. the menu logo's beat pulse) change the required resolution every frame, so once allocated, a resolution of up to
    // resolution_headroom² times the required one is kept, and a canvas that has to be resized gets headroom.
    const fits = canvas.width >= requiredWidth && canvas.height >= requiredHeight
      && canvas.width <= requiredWidth * resolution_headroom ** 2 && canvas.height <= requiredHeight * resolution_headroom ** 2;

    if (!this.allocated || !fits) {
      const headroom = this.allocated ? resolution_headroom : 1;
      canvas.width = Math.ceil(requiredWidth * headroom);
      canvas.height = Math.ceil(requiredHeight * headroom);
      this.allocated = true;
    }

    const width = canvas.width;
    const height = canvas.height;

    if (overflow !== this.appliedOverflow) {
      this.appliedOverflow = overflow;
      canvas.style.left = `${-overflow.left}px`;
      canvas.style.top = `${-overflow.top}px`;
      canvas.style.width = `calc(100% + ${overflow.totalHorizontal}px)`;
      canvas.style.height = `calc(100% + ${overflow.totalVertical}px)`;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(width / totalWidth, 0, 0, height / totalHeight, overflow.left * width / totalWidth, overflow.top * height / totalHeight);

    this.drawCanvas(ctx, size.x, size.y);
    return true;
  }

  /** Draws the contents in draw space (0..width, 0..height), using drawColourInfo for colour. */
  protected abstract drawCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}
