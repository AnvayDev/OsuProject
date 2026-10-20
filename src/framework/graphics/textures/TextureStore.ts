// Ported from osu.Framework/Graphics/Textures/TextureStore.cs and LargeTextureStore.cs (lookup and cache). A texture is a decoded image behind
// an object URL (the browser uploads it). Atlases, mipmaps and LargeTextureStore's reference-counted purge are not reproduced: a loaded texture
// stays cached.

import type { IResourceStore } from '../../io/ResourceStore';
import { Texture } from './Texture';

export class TextureStore {
  private readonly textureCache = new Map<string, Promise<Texture | null>>();

  /** scaleAdjust: the default scale adjustment of the textures (TextureStore defaults to 2, for @2x assets). */
  constructor(private readonly store: IResourceStore<Blob> | null = null, readonly scaleAdjust = 2) {}

  /** Retrieves a texture from the store, or null if it doesn't exist. Lookups are cached, failed ones too. */
  get(name: string | null): Promise<Texture | null> {
    if (!name)
      return Promise.resolve(null);

    let texture = this.textureCache.get(name);

    if (texture === undefined)
      this.textureCache.set(name, texture = this.load(name));

    return texture;
  }

  private async load(name: string): Promise<Texture | null> {
    const data = await this.store?.get(name) ?? null;

    if (data === null)
      return null;

    return Texture.fromUrl(URL.createObjectURL(data), this.scaleAdjust, name);
  }
}

/** A texture store that bypasses atlasing (no difference here). */
export class LargeTextureStore extends TextureStore {
}
