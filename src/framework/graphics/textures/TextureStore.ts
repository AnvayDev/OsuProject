// Ported from osu.Framework/Graphics/Textures/TextureStore.cs, LargeTextureStore.cs and TextureLoaderStore.cs (lookup and cache). A texture is
// a decoded image behind an object URL (the browser uploads it). Atlases, mipmaps and LargeTextureStore's reference-counted purge are not
// reproduced: a loaded texture stays cached. Each texture source is wrapped like Host.CreateTextureLoaderStore (a TextureLoaderStore), which
// searches the png and jpg extensions.

import { type IResourceStore, ResourceStore } from '../../io/ResourceStore';
import { Texture } from './Texture';

export class TextureStore {
  private readonly textureCache = new Map<string, Promise<Texture | null>>();

  private readonly uploadStore = new ResourceStore<Blob>();

  /** scaleAdjust: the default scale adjustment of the textures (TextureStore defaults to 2, for @2x assets). */
  constructor(store: IResourceStore<Blob> | null = null, readonly scaleAdjust = 2) {
    if (store !== null)
      this.addTextureSource(store);
  }

  /** Adds a texture data lookup source (searched in the order added). */
  addTextureSource(store: IResourceStore<Blob>): void {
    // TextureLoaderStore
    const loaderStore = new ResourceStore<Blob>(store);
    loaderStore.addExtension('png');
    loaderStore.addExtension('jpg');

    this.uploadStore.addStore(loaderStore);
  }

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
    const data = await this.uploadStore.get(name);

    if (data === null)
      return null;

    return Texture.fromUrl(URL.createObjectURL(data), this.scaleAdjust, name);
  }
}

/** A texture store that bypasses atlasing (no difference here). */
export class LargeTextureStore extends TextureStore {
}
