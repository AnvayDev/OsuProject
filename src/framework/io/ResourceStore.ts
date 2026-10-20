// Ported from osu.Framework/IO/Stores/IResourceStore.cs, ResourceStore.cs and NamespacedResourceStore.cs.
// Web: lookups are asynchronous (C# Get/GetAsync/GetStream all become get()), and byte stores hold Blobs (C# byte[] / Stream).

export interface IResourceStore<T> {
  /** Retrieves an object from the store, or null if it doesn't exist. */
  get(name: string): Promise<T | null>;

  /** Gets a collection of string representations of the resources available in this store. */
  getAvailableResources(): readonly string[];
}

export class ResourceStore<T> implements IResourceStore<T> {
  private readonly stores: IResourceStore<T>[] = [];

  private readonly searchExtensions: string[] = [];

  constructor(store: IResourceStore<T> | readonly IResourceStore<T>[] | null = null) {
    if (Array.isArray(store)) {
      for (const s of store)
        this.addStore(s);
    } else if (store !== null)
      this.addStore(store as IResourceStore<T>);
  }

  /** Adds a resource store to this store. */
  addStore(store: IResourceStore<T>): void {
    this.stores.push(store);
  }

  /** Removes a store from this store. */
  removeStore(store: IResourceStore<T>): void {
    const i = this.stores.indexOf(store);
    if (i >= 0) this.stores.splice(i, 1);
  }

  /** Retrieves an object from the store, trying each nested store with each candidate filename (name, then name.ext for each search extension). */
  async get(name: string | null): Promise<T | null> {
    if (name === null)
      return null;

    const filenames = this.getFilenames(name);

    for (const store of [...this.stores]) {
      for (const f of filenames) {
        const result = await store.get(f);
        if (result !== null)
          return result;
      }
    }

    return null;
  }

  protected getFilenames(name: string): string[] {
    //add file extension if it's missing.
    return [name, ...this.searchExtensions.map(ext => `${name}.${ext}`)];
  }

  /** Adds a file extension to this store's search extensions. */
  addExtension(extension: string): void {
    extension = extension.replace(/^\.+|\.+$/g, '');

    if (!this.searchExtensions.includes(extension))
      this.searchExtensions.push(extension);
  }

  getAvailableResources(): readonly string[] {
    return this.stores.flatMap(s => s.getAvailableResources());
  }
}

export class NamespacedResourceStore<T> extends ResourceStore<T> {
  /** Initializes a resource store with a single store, searched within the given namespace (a path prefix). */
  constructor(store: IResourceStore<T>, readonly namespace: string) {
    super(store);
  }

  protected override getFilenames(name: string): string[] {
    return super.getFilenames(name).map(f => `${this.namespace}/${f}`);
  }

  override getAvailableResources(): readonly string[] {
    const prefix = `${this.namespace}/`;
    return super.getAvailableResources().filter(x => x.startsWith(prefix)).map(x => x.slice(prefix.length));
  }
}

/**
 * The web counterpart of DllResourceStore (embedded resources): files served below a base URL, listed in a manifest written by
 * scripts/prepare-assets.mjs, so lookups of missing names don't hit the network.
 */
export class UrlResourceStore implements IResourceStore<Blob> {
  private readonly available: Set<string>;

  constructor(private readonly baseUrl: string, available: Iterable<string>) {
    this.available = new Set(available);
  }

  static async fromManifest(baseUrl: string, manifestName = 'index.json'): Promise<UrlResourceStore> {
    const r = await fetch(`${baseUrl}/${manifestName}`);
    return new UrlResourceStore(baseUrl, r.ok ? await r.json() as string[] : []);
  }

  async get(name: string): Promise<Blob | null> {
    if (!this.available.has(name))
      return null;

    const r = await fetch(`${this.baseUrl}/${name.split('/').map(encodeURIComponent).join('/')}`);
    return r.ok ? r.blob() : null;
  }

  getAvailableResources(): readonly string[] {
    return [...this.available];
  }
}

/** Ported from osu.Framework/IO/Stores/OnlineStore.cs: fetches http(s) URLs; any failure yields null. */
export class OnlineStore implements IResourceStore<Blob> {
  async get(url: string): Promise<Blob | null> {
    if (!/^https?:\/\//i.test(url))
      return null;

    try {
      const r = await fetch(this.getLookupUrl(url));
      return r.ok ? await r.blob() : null;
    } catch {
      return null;
    }
  }

  getAvailableResources(): readonly string[] {
    return [];
  }

  protected getLookupUrl(url: string): string {
    return url;
  }
}
