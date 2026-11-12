// Ported from osu.Framework/Graphics/Textures/Texture.cs (the parts that affect layout) + TextureWhitePixel.
// A texture here is a decoded image addressed by URL; the browser does the GPU upload.

import { Vector2 } from '../../layout/Vector2';

const originsWithoutCors = new Set<string>();

export class Texture {
  /** The url of the image (object URL or asset path). Null for the white pixel. */
  readonly url: string | null;

  /** Pixel width/height of the underlying image. */
  readonly width: number;
  readonly height: number;

  /** By default, texture sizes are divided by ScaleAdjust (TextureStore uses 2 for @2x assets). */
  scaleAdjust = 1;

  /** Optional asset name for debugging. */
  assetName = '';

  /** The decoded image, which a Renderer uploads on first use (null: the texture can only be displayed by the DOM, through its url). */
  image: TexImageSource | null = null;

  constructor(url: string | null, width: number, height: number) {
    this.url = url;
    this.width = width;
    this.height = height;
  }

  /** The texture's width divided by scaleAdjust. */
  get displayWidth(): number {
    return this.width / this.scaleAdjust;
  }

  /** The texture's height divided by scaleAdjust. */
  get displayHeight(): number {
    return this.height / this.scaleAdjust;
  }

  get displaySize(): Vector2 {
    return new Vector2(this.displayWidth, this.displayHeight);
  }

  get size(): Vector2 {
    return new Vector2(this.width, this.height);
  }

  /** IRenderer.WhitePixel: a 1x1 white texture. Drawn as a solid colour fill. */
  static readonly WhitePixel = new Texture(null, 1, 1);

  get isWhitePixel(): boolean {
    return this === Texture.WhitePixel;
  }

  dispose(): void {}

  /** Loads an image into a Texture (decode included, so it is ready to display). */
  static async fromUrl(url: string, scaleAdjust = 1, assetName = url): Promise<Texture> {
    let img = new Image();
    img.decoding = 'async';

    // A renderer can only upload another origin's image if that origin allows it (CORS). Hosts that don't (assets.ppy.sh and a.ppy.sh, as
    // of 2026-11) are loaded without CORS, and the texture is then one only the page itself can show (see Texture.image).
    const origin = /^https?:/.test(url) ? new URL(url, location.href).origin : location.origin;
    const crossOrigin = origin !== location.origin;
    let uploadable = !originsWithoutCors.has(origin);

    if (crossOrigin && uploadable)
      img.crossOrigin = 'anonymous';

    img.src = url;

    try {
      await img.decode();
    } catch (e) {
      if (!crossOrigin || !uploadable)
        throw e;

      // (asked once per origin: every refused request is logged by the browser and delays the image)
      originsWithoutCors.add(origin);

      img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      uploadable = false;
    }

    const t = new Texture(url, img.naturalWidth, img.naturalHeight);
    t.image = uploadable ? img : null;
    t.scaleAdjust = scaleAdjust;
    t.assetName = assetName;
    return t;
  }
}
