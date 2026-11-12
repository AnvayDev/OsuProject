// Ported from osu.Framework/Graphics/Textures/TextureStore.cs, LargeTextureStore.cs and TextureLoaderStore.cs (lookup and cache). A texture is
// a decoded image behind an object URL (the browser uploads it). Atlases, mipmaps and LargeTextureStore's reference-counted purge are not
// reproduced: a loaded texture stays cached. Each texture source is wrapped like Host.CreateTextureLoaderStore (a TextureLoaderStore), which
// searches the png and jpg extensions.
// Web: an http(s) name with an OnlineStore source is used as the texture's URL directly: the image element displays cross-origin images that
// a fetch can't read (no CORS headers, e.g. assets.ppy.sh covers).

import { type IResourceStore, OnlineStore, ResourceStore } from '../../io/ResourceStore';
import { Texture } from './Texture';

export class TextureStore {
  private readonly textureCache = new Map<string, Promise<Texture | null>>();

  private readonly uploadStore = new ResourceStore<Blob>();

  private hasOnlineSource = false;

  /** scaleAdjust: the default scale adjustment of the textures (TextureStore defaults to 2, for @2x assets). */
  constructor(store: IResourceStore<Blob> | null = null, readonly scaleAdjust = 2) {
    if (store !== null)
      this.addTextureSource(store);
  }

  /** Adds a texture data lookup source (searched in the order added). */
  addTextureSource(store: IResourceStore<Blob>): void {
    if (store instanceof OnlineStore)
      this.hasOnlineSource = true;

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

    if (texture === undefined) {
      this.textureCache.set(name, texture = this.load(name));
      void texture.then(t => this.loadedTextures.set(name, t), () => this.loadedTextures.set(name, null));
    }

    return texture;
  }

  /** The textures that have finished loading (null: the resource doesn't exist), for getSync. */
  private readonly loadedTextures = new Map<string, Texture | null>();

  /**
   * C#'s synchronous Get, for callers that must not wait (skin texture lookups): the texture if it has been loaded through get() or
   * preload(), else null. A texture that exists but has not been loaded yet starts loading and is returned by a later call.
   */
  getSync(name: string | null): Texture | null {
    if (!name) return null;

    const texture = this.loadedTextures.get(name);

    if (texture === undefined) {
      void this.get(name);
      return null;
    }

    return texture;
  }

  /** Loads textures ahead of use, so that getSync finds them. */
  async preload(names: Iterable<string>): Promise<void> {
    await Promise.all([...names].map(name => this.get(name)));
  }

  private async load(name: string): Promise<Texture | null> {
    if (this.hasOnlineSource && /^https?:\/\//i.test(name)) {
      try {
        return await Texture.fromUrl(name, this.scaleAdjust, name);
      } catch {
        return null;
      }
    }

    const data = await this.uploadStore.get(name);

    if (data === null)
      return null;

    return Texture.fromUrl(URL.createObjectURL(data), this.scaleAdjust, name);
  }
}

/** A texture store that bypasses atlasing (no difference here). */
export class LargeTextureStore extends TextureStore {
}
