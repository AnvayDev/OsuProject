// Ported from osu.Game/Skinning/SkinTransformer.cs and ISkinTransformer.cs

import type { Sample } from '@fw/audio/sample/Sample';
import type { Bindable } from '@fw/bindables/Bindable';
import type { Drawable } from '@fw/graphics/Drawable';
import type { WrapMode } from '@fw/graphics/rendering/Renderer';
import type { Texture } from '@fw/graphics/textures/Texture';
import type { ISampleInfo } from '../audio/SampleInfo';
import type { ISkin, ISkinComponentLookup } from './ISkin';

/** A skin transformer takes in an ISkin and applies transformations to it. The most common use case is allowing individual rulesets to add skinnable components without directly coupling to underlying skins. */
export interface ISkinTransformer extends ISkin {
  /** The original skin that is being transformed. */
  readonly skin: ISkin;
}

export const isSkinTransformer = (skin: ISkin): skin is ISkinTransformer => 'skin' in skin;

export abstract class SkinTransformer implements ISkinTransformer {
  constructor(readonly skin: ISkin) {}

  getDrawableComponent(lookup: ISkinComponentLookup): Drawable | null {
    return this.skin.getDrawableComponent(lookup);
  }

  getTexture(componentName: string, wrapModeS?: WrapMode, wrapModeT?: WrapMode): Texture | null {
    return this.skin.getTexture(componentName, wrapModeS, wrapModeT);
  }

  getSample(sampleInfo: ISampleInfo): Sample | null {
    return this.skin.getSample(sampleInfo);
  }

  getConfig<TValue>(lookup: unknown): Bindable<TValue> | null {
    return this.skin.getConfig<TValue>(lookup);
  }

  toString(): string {
    return `SkinTransformer { Skin: ${String(this.skin)} }`;
  }
}
