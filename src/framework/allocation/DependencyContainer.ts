// Ported from osu.Framework/Allocation/DependencyContainer.cs and IReadOnlyDependencyContainer.cs.
// Without reflection, [Resolved]/[BackgroundDependencyLoader] become explicit `dependencies.get(Type)` calls in load(),
// and [Cached] becomes `dependencies.cacheAs(Type, this)` in createChildDependencies().
// CacheInfo (name/parent qualifiers) is reduced to an optional name.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DependencyKey<T> = abstract new (...args: any[]) => T;

export interface IReadOnlyDependencyContainer {
  /** Retrieves a cached dependency of the given type, or null (Get returns null when nothing is cached). */
  get<T>(type: DependencyKey<T>, name?: string): T | null;

  /** Like get(), but throws when the dependency is missing (a non-nullable [Resolved] member). */
  resolve<T>(type: DependencyKey<T>, name?: string): T;
}

export class DependencyContainer implements IReadOnlyDependencyContainer {
  private readonly cacheMap = new Map<unknown, Map<string, unknown>>();

  constructor(private readonly parentContainer: IReadOnlyDependencyContainer | null = null) {}

  /** Caches an instance as its own type (Cache(object)). */
  cache(instance: object, name = ''): void {
    this.cacheAs(instance.constructor as DependencyKey<object>, instance, name);
  }

  /** Caches an instance as a type of its hierarchy (CacheAs<T>). */
  cacheAs<T>(type: DependencyKey<T>, instance: T, name = ''): void {
    if (instance == null)
      throw new Error('instance may not be null.');

    if (!(instance instanceof (type as unknown as abstract new () => unknown)))
      throw new Error(`${(instance as object).constructor.name} must be a subclass of ${type.name}.`);

    let byName = this.cacheMap.get(type);
    if (byName === undefined)
      this.cacheMap.set(type, byName = new Map());

    if (byName.has(name))
      throw new Error(`An instance of the member (${type.name}${name ? `, ${name}` : ''}) has already been cached to the dependency container.`);

    byName.set(name, instance);
  }

  get<T>(type: DependencyKey<T>, name = ''): T | null {
    const existing = this.cacheMap.get(type)?.get(name);
    if (existing !== undefined)
      return existing as T;

    return this.parentContainer?.get(type, name) ?? null;
  }

  /** Like get(), but throws when the dependency is missing (a non-nullable [Resolved] member). */
  resolve<T>(type: DependencyKey<T>, name = ''): T {
    const value = this.get(type, name);
    if (value === null)
      throw new Error(`Missing dependency ${type.name}${name ? ` (${name})` : ''}.`);

    return value;
  }
}
