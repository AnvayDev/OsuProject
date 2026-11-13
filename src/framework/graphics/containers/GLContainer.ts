// Not a port. In osu!framework the whole scene graph is drawn by the renderer (GameHost.DrawFrame → DrawNode.Draw). Here the DOM draws by
// default and a GLContainer is the boundary where the framework's own renderer (a WebGL2 port, see rendering/Renderer.ts) takes over: its
// element holds a <canvas> covering its draw rectangle and everything below it is drawn there with Drawable.draw, so its descendants never
// create DOM elements. To the DOM around it, it is one leaf element (a transparent layer in draw order).
//
// The canvas is as large as the container's screen-space rectangle in device pixels. The container must be axis-aligned on screen.

import { RectangleF } from '../../layout/Primitives';
import { Renderer } from '../rendering/Renderer';
import { Container } from './Container';

export class GLContainer extends Container {
  private rendererBacking: Renderer | null = null;

  /** The renderer drawing this container's children (created with the canvas on the first draw). */
  get renderer(): Renderer | null {
    return this.rendererBacking;
  }

  private canvas: HTMLCanvasElement | null = null;

  /** Whether the canvas is the whole picture, cleared to opaque black as the client's backbuffer (set before the first draw). */
  opaque = false;

  /** Time spent in the last draw (generating the draw list and submitting it), in milliseconds. */
  lastDrawDuration = 0;

  /** @internal The element walk ends here: the children are drawn by the renderer. */
  override validateElementSubTree(): void {
    this.validateElement();
    this.drawFrame();
  }

  private drawFrame(): void {
    const start = performance.now();

    const aabb = this.screenSpaceDrawQuad.aabbFloat;
    const ratio = window.devicePixelRatio || 1;

    const width = Math.round(aabb.width * ratio);
    const height = Math.round(aabb.height * ratio);

    if (width <= 0 || height <= 0)
      return;

    if (this.canvas === null) {
      // (behind the canvas: see Renderer, Underlays. Isolated, so that the images' z-index orders them among themselves only.)
      const underlays = document.createElement('div');
      underlays.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;isolation:isolate';
      this.element.appendChild(underlays);

      const canvas = this.canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
      this.element.appendChild(canvas);

      this.rendererBacking = new Renderer(canvas);
      this.rendererBacking.underlayHost = underlays;
      this.rendererBacking.opaque = this.opaque;
    }

    const canvas = this.canvas;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const renderer = this.rendererBacking!;

    // The exact scale of the backing store (it is a whole number of device pixels, the rectangle may not be).
    renderer.pixelRatio = width / aabb.width;

    renderer.beginFrame(new RectangleF(aabb.x, aabb.y, aabb.width, height / renderer.pixelRatio));

    // (the root DrawNode: this container itself is never flattened into a parent, and masks nothing by itself)
    if (this.generateDrawNodeSubtree())
      this.draw(renderer);

    renderer.finishFrame();

    this.lastDrawDuration = performance.now() - start;
  }

  protected override disposeInternal(isDisposing: boolean): void {
    this.rendererBacking?.dispose();
    this.rendererBacking = null;

    super.disposeInternal(isDisposing);
  }
}
