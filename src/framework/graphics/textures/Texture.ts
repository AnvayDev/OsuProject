// Ported from osu.Framework/Graphics/Textures/Texture.cs (the parts that affect layout) + TextureWhitePixel.
// A texture here is a decoded image addressed by URL; the browser does the GPU upload.

import { Vector2 } from '../../layout/Vector2';

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
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();

    const t = new Texture(url, img.naturalWidth, img.naturalHeight);
    t.scaleAdjust = scaleAdjust;
    t.assetName = assetName;
    return t;
  }
}
