// Ported from osu.Game/Graphics/Backgrounds/SeasonalBackgroundLoader.cs (SeasonalBackgroundLoader, SeasonalBackground)
// The fetch is the bundled response (BundledSeasonalBackgrounds.ts) instead of GetSeasonalBackgroundsRequest. assets.ppy.sh sends no CORS headers,
// so a seasonal texture is decoded straight from its URL (an <img> needs no CORS to display) instead of through LargeTextureStore's online
// store, which fetches the bytes.

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import type { Bindable } from '@fw/bindables/Bindable';
import { Signal } from '@fw/bindables/Signal';
import { Component } from '@fw/graphics/Component';
import { Texture } from '@fw/graphics/textures/Texture';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import { RNG } from '@fw/utils/RNG';
import { OsuConfigManager, OsuSetting } from '../../configuration/OsuConfigManager';
import { SeasonalBackgroundMode } from '../../configuration/SeasonalBackgroundMode';
import { SessionStatics, Static } from '../../configuration/SessionStatics';
import type { APISeasonalBackgrounds } from '../../online/api/requests/responses/APISeasonalBackgrounds';
import { Background } from './Background';
import { BUNDLED_SEASONAL_BACKGROUNDS } from './BundledSeasonalBackgrounds';

export class SeasonalBackgroundLoader extends Component {
  /** Fired when background should be changed due to receiving backgrounds from API or when the user setting is changed in the UI. */
  readonly seasonalBackgroundChanged = new Signal();

  private seasonalBackgroundMode!: Bindable<SeasonalBackgroundMode>;
  private seasonalBackgrounds!: Bindable<APISeasonalBackgrounds | null>;

  private current = 0;

  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> | void {
    const r = super.load(dependencies);

    this.seasonalBackgroundMode = dependencies.resolve(OsuConfigManager).getBindable<SeasonalBackgroundMode>(OsuSetting.SeasonalBackgroundMode);
    this.seasonalBackgroundMode.bindValueChanged(() => this.seasonalBackgroundChanged.emit());

    this.seasonalBackgrounds = dependencies.resolve(SessionStatics).getBindable<APISeasonalBackgrounds | null>(Static.SeasonalBackgrounds);
    this.seasonalBackgrounds.bindValueChanged(() => {
      if (this.shouldShowSeasonal)
        this.seasonalBackgroundChanged.emit();
    });

    this.fetchSeasonalBackgrounds();

    return r;
  }

  private fetchSeasonalBackgrounds(): void {
    if (this.seasonalBackgrounds.value !== null)
      return;

    // request.Success
    const response = BUNDLED_SEASONAL_BACKGROUNDS;
    this.seasonalBackgrounds.value = response;
    this.current = RNG.next(0, response.backgrounds?.length ?? 0);
  }

  loadNextBackground(): SeasonalBackground | null {
    if (!this.shouldShowSeasonal)
      return null;

    const backgrounds = this.seasonalBackgrounds.value!.backgrounds!;

    this.current = (this.current + 1) % backgrounds.length;
    const url = backgrounds[this.current].url;

    return new SeasonalBackground(url);
  }

  private get shouldShowSeasonal(): boolean {
    if (this.seasonalBackgroundMode.value === SeasonalBackgroundMode.Never)
      return false;

    if (this.seasonalBackgroundMode.value === SeasonalBackgroundMode.Sometimes && !this.isInSeason)
      return false;

    return (this.seasonalBackgrounds.value?.backgrounds?.length ?? 0) > 0;
  }

  private get isInSeason(): boolean {
    return this.seasonalBackgrounds.value !== null && Date.now() < this.seasonalBackgrounds.value.endDate.getTime();
  }
}

export class SeasonalBackground extends Background {
  private static readonly fallback_texture_name = 'Backgrounds/bg1';

  constructor(private readonly url: string) {
    super();
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.sprite.texture = await Texture.fromUrl(this.url, 1, this.url).catch(() => null)
      ?? await dependencies.resolve(LargeTextureStore).get(SeasonalBackground.fallback_texture_name);
  }

  override equals(other: Background | null): boolean {
    if (other === null) return false;
    if (this === other) return true;

    return other.constructor === this.constructor
      && (other as SeasonalBackground).url === this.url;
  }
}
