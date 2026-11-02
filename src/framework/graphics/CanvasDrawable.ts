// Not a port: the DOM counterpart of a Drawable with a custom DrawNode (osu.Framework/Graphics/DrawNode.cs), for procedural leaf drawing
// (TrianglesV2, LogoVisualisation). The element holds a <canvas> covering the draw rectangle at screen resolution (draw size × screen-space
// scale × devicePixelRatio). Like a DrawNode, it draws in ApplyState (applyElementState) whenever the drawable is invalidated with
// Invalidation.DrawNode, in local draw-space units, with the drawable's DrawColourInfo (which already carries every ancestor's colour and alpha).

import { Invalidation } from '../layout/Enums';
import { Drawable } from './Drawable';

const resolution_headroom = 1.1;

export abstract class CanvasDrawable extends Drawable {
  // (createElement runs inside the Drawable constructor, before this class's fields are defined, so the canvas is read from the element.)
  private get canvas(): HTMLCanvasElement {
    return this.element.firstChild as HTMLCanvasElement;
  }

  private contextBacking: CanvasRenderingContext2D | null | undefined;

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
   * How far (in draw-space units) drawing may extend outside the draw rectangle on every side. A DrawNode is not clipped to its drawable's
   * bounds, so drawables that draw outside them (e.g. visualiser bars) need the canvas enlarged by this much.
   */
  protected get drawOverflow(): number {
    return 0;
  }

  /** Requests a redraw on the next element validation (DrawNode invalidation). */
  protected invalidateDraw(): void {
    this.invalidate(Invalidation.DrawNode);
  }

  protected override applyElementState(): void {
    super.applyElementState();

    const canvas = this.canvas;
    const ctx = this.contextBacking === undefined ? (this.contextBacking = canvas.getContext('2d')) : this.contextBacking;
    if (ctx === null)
      return;

    const size = this.drawSize;
    if (size.x <= 0 || size.y <= 0)
      return;

    // Pixels per draw-space unit on screen.
    const quad = this.screenSpaceDrawQuad;
    const ratio = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const scale = Math.max(quad.width / size.x, quad.height / size.y, 1e-3) * ratio;

    const overflow = this.drawOverflow;
    const totalWidth = size.x + overflow * 2;
    const totalHeight = size.y + overflow * 2;

    const requiredWidth = Math.max(1, Math.ceil(totalWidth * scale));
    const requiredHeight = Math.max(1, Math.ceil(totalHeight * scale));

    // Resizing a canvas reallocates (and clears) its backing store. Animated scales (e.g. the menu logo's beat pulse) change the required
    // resolution every frame, so a resolution of up to resolution_headroom² times the required one is kept, and growth allocates headroom.
    if (canvas.width < requiredWidth || canvas.height < requiredHeight
        || canvas.width > requiredWidth * resolution_headroom ** 2 || canvas.height > requiredHeight * resolution_headroom ** 2) {
      canvas.width = Math.ceil(requiredWidth * resolution_headroom);
      canvas.height = Math.ceil(requiredHeight * resolution_headroom);
    }

    const width = canvas.width;
    const height = canvas.height;

    const cssOffset = `${-overflow}px`;
    if (canvas.style.left !== cssOffset) {
      canvas.style.left = canvas.style.top = cssOffset;
      canvas.style.width = `calc(100% + ${overflow * 2}px)`;
      canvas.style.height = `calc(100% + ${overflow * 2}px)`;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(width / totalWidth, 0, 0, height / totalHeight, overflow * width / totalWidth, overflow * height / totalHeight);

    this.draw(ctx, size.x, size.y);
  }

  /** Draws the contents in draw space (0..width, 0..height), using drawColourInfo for colour. */
  protected abstract draw(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}
