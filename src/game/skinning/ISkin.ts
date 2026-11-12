// Ported from osu.Game/Skinning/ISkin.cs, ISkinSource.cs, ISkinComponentLookup.cs and SkinComponentLookup.cs
//
// Web: lookups are synchronous, as in C#. Textures and samples come from stores that load asynchronously here, so a skin answers from what
// is already loaded (TextureStore.getSync, SampleStore.getSync): whoever creates a skin preloads its resources first.
// C#'s GetConfig<TLookup, TValue> dispatches on the lookup's type; here the lookup is a value that implementations test with instanceof
// or, for enums, through a typed wrapper (see SkinConfigLookup.ts).

import type { Sample } from '@fw/audio/sample/Sample';
import type { Bindable } from '@fw/bindables/Bindable';
import type { Signal } from '@fw/bindables/Signal';
import type { Drawable } from '@fw/graphics/Drawable';
import type { WrapMode } from '@fw/graphics/rendering/Renderer';
import type { Texture } from '@fw/graphics/textures/Texture';
import type { ISampleInfo } from '../audio/SampleInfo';

/** The base lookup type to be used with ISkin.getDrawableComponent. */
export interface ISkinComponentLookup {
}

/** A lookup type which can be used with ISkin.getDrawableComponent: a member of a ruleset's (or the game's) component enum. */
export abstract class SkinComponentLookup<T> implements ISkinComponentLookup {
  constructor(readonly component: T) {}
}

/** Provides access to various elements contained by a skin. */
export interface ISkin {
  /** Retrieve a Drawable component implementation, or null if this skin doesn't provide it. */
  getDrawableComponent(lookup: ISkinComponentLookup): Drawable | null;

  /** Retrieve a Texture, or null if not available. */
  getTexture(componentName: string, wrapModeS?: WrapMode, wrapModeT?: WrapMode): Texture | null;

  /** Retrieve a Sample, or null if not available. */
  getSample(sampleInfo: ISampleInfo): Sample | null;

  /** Retrieve a configuration value, or null if not available. */
  getConfig<TValue>(lookup: unknown): Bindable<TValue> | null;
}

/**
 * An abstract skin implementation, whose primary purpose is to properly handle component fallback across multiple layers of skins (e.g.:
 * beatmap skin, user skin, default skin). Common usage is to do an initial lookup via findProvider, and use the returned ISkin to do
 * further lookups for related components.
 *
 * A DI key (C# resolves the interface): implementations cache themselves with `cacheAs(ISkinSource, this)` and carry the isSkinSource marker.
 */
export abstract class ISkinSource implements ISkin {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (instance as { isSkinSource?: unknown } | null)?.isSkinSource === true;
  }

  abstract readonly isSkinSource: true;

  /** Fired whenever a source change occurs, signalling that consumers should re-query as required. */
  abstract readonly sourceChanged: Signal<void>;

  /** Find the first (if any) skin that can fulfill the lookup. This should be used for cases where subsequent lookups (for related components) need to occur on the same skin. */
  abstract findProvider(lookupFunction: (skin: ISkin) => boolean): ISkin | null;

  /** Retrieve all sources available for lookup, with highest priority source first. */
  abstract get allSources(): Iterable<ISkin>;

  abstract getDrawableComponent(lookup: ISkinComponentLookup): Drawable | null;
  abstract getTexture(componentName: string, wrapModeS?: WrapMode, wrapModeT?: WrapMode): Texture | null;
  abstract getSample(sampleInfo: ISampleInfo): Sample | null;
  abstract getConfig<TValue>(lookup: unknown): Bindable<TValue> | null;
}

export const isSkinSource = (skin: ISkin): skin is ISkinSource => (skin as { isSkinSource?: unknown }).isSkinSource === true;
