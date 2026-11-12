// Ported from osu.Game/Skinning/SkinProvidingContainer.cs

import { DependencyContainer, type IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Sample } from '@fw/audio/sample/Sample';
import type { Bindable } from '@fw/bindables/Bindable';
import { Signal } from '@fw/bindables/Signal';
import { Container } from '@fw/graphics/containers/Container';
import type { Drawable } from '@fw/graphics/Drawable';
import type { WrapMode } from '@fw/graphics/rendering/Renderer';
import type { Texture } from '@fw/graphics/textures/Texture';
import { Axes } from '@fw/layout/Enums';
import type { ISampleInfo } from '../audio/SampleInfo';
import { type ISkin, type ISkinComponentLookup, ISkinSource, isSkinSource } from './ISkin';
import { GlobalSkinColoursLookup, SkinComboColourLookup, SkinCustomColourLookup } from './SkinConfigLookup';

/** A container that applies user-configured visual settings to its contents. */
export class SkinProvidingContainer extends Container implements ISkinSource {
  readonly isSkinSource = true as const;

  readonly sourceChanged = new Signal<void>();

  protected parentSource: ISkinSource | null = null;

  /** Whether falling back to parent ISkinSources is allowed in this container. */
  protected get allowFallingBackToParent(): boolean {
    return true;
  }

  protected allowDrawableLookup(_lookup: ISkinComponentLookup): boolean {
    return true;
  }

  protected allowTextureLookup(_componentName: string): boolean {
    return true;
  }

  protected allowSampleLookup(_sampleInfo: ISampleInfo): boolean {
    return true;
  }

  protected get allowConfigurationLookup(): boolean {
    return true;
  }

  protected get allowColourLookup(): boolean {
    return true;
  }

  /** A dictionary mapping each ISkin source to a wrapper which handles lookup allowances. */
  private skinSources: { skin: ISkin; wrapped: DisableableSkinSource }[] = [];

  /** This container's lookup allowances, as its DisableableSkinSources query them (the nested class reads the provider's protected members in C#). */
  private readonly allowances: Allowances = {
    drawable: lookup => this.allowDrawableLookup(lookup),
    texture: componentName => this.allowTextureLookup(componentName),
    sample: sampleInfo => this.allowSampleLookup(sampleInfo),
    configuration: () => this.allowConfigurationLookup,
    colour: () => this.allowColourLookup,
  };

  /** Constructs a new SkinProvidingContainer initialised with a single skin source (or with none, to be set via setSources). */
  constructor(skin: ISkin | null = null) {
    super();

    this.relativeSizeAxes = Axes.Both;

    if (skin !== null)
      this.setSources([skin]);
  }

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    const dependencies = new DependencyContainer(super.createChildDependencies(parent));

    this.parentSource = dependencies.get(ISkinSource);
    this.parentSource?.sourceChanged.add(this.triggerSourceChanged);

    dependencies.cacheAs(ISkinSource, this);

    this.triggerSourceChanged();

    return dependencies;
  }

  findProvider(lookupFunction: (skin: ISkin) => boolean): ISkin | null {
    for (const { skin, wrapped } of this.skinSources) {
      if (lookupFunction(wrapped))
        return skin;
    }

    if (!this.allowFallingBackToParent)
      return null;

    return this.parentSource?.findProvider(lookupFunction) ?? null;
  }

  get allSources(): Iterable<ISkin> {
    const sources = this.skinSources.map(s => s.skin);

    if (this.allowFallingBackToParent && this.parentSource !== null)
      sources.push(...this.parentSource.allSources);

    return sources;
  }

  getDrawableComponent(lookup: ISkinComponentLookup): Drawable | null {
    for (const { wrapped } of this.skinSources) {
      const sourceDrawable = wrapped.getDrawableComponent(lookup);
      if (sourceDrawable !== null)
        return sourceDrawable;
    }

    if (!this.allowFallingBackToParent)
      return null;

    return this.parentSource?.getDrawableComponent(lookup) ?? null;
  }

  getTexture(componentName: string, wrapModeS?: WrapMode, wrapModeT?: WrapMode): Texture | null {
    for (const { wrapped } of this.skinSources) {
      const sourceTexture = wrapped.getTexture(componentName, wrapModeS, wrapModeT);
      if (sourceTexture !== null)
        return sourceTexture;
    }

    if (!this.allowFallingBackToParent)
      return null;

    return this.parentSource?.getTexture(componentName, wrapModeS, wrapModeT) ?? null;
  }

  getSample(sampleInfo: ISampleInfo): Sample | null {
    for (const { wrapped } of this.skinSources) {
      const sourceSample = wrapped.getSample(sampleInfo);
      if (sourceSample !== null)
        return sourceSample;
    }

    if (!this.allowFallingBackToParent)
      return null;

    return this.parentSource?.getSample(sampleInfo) ?? null;
  }

  getConfig<TValue>(lookup: unknown): Bindable<TValue> | null {
    for (const { wrapped } of this.skinSources) {
      const bindable = wrapped.getConfig<TValue>(lookup);
      if (bindable !== null)
        return bindable;
    }

    if (!this.allowFallingBackToParent)
      return null;

    return this.parentSource?.getConfig<TValue>(lookup) ?? null;
  }

  /** Replace the sources used for lookups in this container. This does not implicitly fire a sourceChanged event. Consider calling triggerSourceChanged if required. */
  protected setSources(sources: Iterable<ISkin | null>): void {
    for (const { skin } of this.skinSources) {
      if (isSkinSource(skin))
        skin.sourceChanged.remove(this.triggerSourceChanged);
    }

    this.skinSources = [...sources]
      // Shouldn't be required after NRT is applied to all calling sources.
      .filter((skin): skin is ISkin => skin !== null)
      .map(skin => ({ skin, wrapped: new DisableableSkinSource(skin, this.allowances) }));

    for (const { skin } of this.skinSources) {
      if (isSkinSource(skin))
        skin.sourceChanged.add(this.triggerSourceChanged);
    }
  }

  /** Invoked after any consumed source change, before the external sourceChanged event is fired. This is also invoked once initially during createChildDependencies to ensure sources are ready for children consumption. */
  protected refreshSources(): void {
  }

  protected readonly triggerSourceChanged = (): void => {
    // Expose to implementations, giving them a chance to react before notifying external consumers.
    this.refreshSources();

    this.sourceChanged.emit();
  };

  protected override disposeInternal(isDisposing: boolean): void {
    // Must be done before base.Dispose()
    this.sourceChanged.clear();

    super.disposeInternal(isDisposing);

    this.parentSource?.sourceChanged.remove(this.triggerSourceChanged);

    for (const { skin } of this.skinSources) {
      if (isSkinSource(skin))
        skin.sourceChanged.remove(this.triggerSourceChanged);
    }
  }
}

interface Allowances {
  drawable(lookup: ISkinComponentLookup): boolean;
  texture(componentName: string): boolean;
  sample(sampleInfo: ISampleInfo): boolean;
  configuration(): boolean;
  colour(): boolean;
}

class DisableableSkinSource implements ISkin {
  constructor(private readonly skin: ISkin, private readonly provider: Allowances) {}

  getDrawableComponent(lookup: ISkinComponentLookup): Drawable | null {
    if (this.provider.drawable(lookup))
      return this.skin.getDrawableComponent(lookup);

    return null;
  }

  getTexture(componentName: string, wrapModeS?: WrapMode, wrapModeT?: WrapMode): Texture | null {
    if (this.provider.texture(componentName))
      return this.skin.getTexture(componentName, wrapModeS, wrapModeT);

    return null;
  }

  getSample(sampleInfo: ISampleInfo): Sample | null {
    if (this.provider.sample(sampleInfo))
      return this.skin.getSample(sampleInfo);

    return null;
  }

  getConfig<TValue>(lookup: unknown): Bindable<TValue> | null {
    if (lookup instanceof GlobalSkinColoursLookup || lookup instanceof SkinComboColourLookup || lookup instanceof SkinCustomColourLookup) {
      if (this.provider.colour())
        return this.skin.getConfig<TValue>(lookup);
    } else if (this.provider.configuration())
      return this.skin.getConfig<TValue>(lookup);

    return null;
  }

  toString(): string {
    return `DisableableSkinSource { Skin: ${String(this.skin)} }`;
  }
}
