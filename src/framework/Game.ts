// Ported from osu.Framework/Game.cs (scene-graph structure, fonts, resources, textures and audio; shaders and config are not ported).

import { Container } from './graphics/containers/Container';
import { DrawSizePreservingFillContainer } from './graphics/containers/DrawSizePreservingFillContainer';
import type { Drawable } from './graphics/Drawable';
import { Anchor, Axes } from './layout/Enums';
import { Vector2 } from './layout/Vector2';
import type { GameHost } from './platform/GameHost';
import { DependencyContainer, type IReadOnlyDependencyContainer } from './allocation/DependencyContainer';
import { FontStore, GlyphStore } from './text/FontStore';
import { AudioManager } from './audio/AudioManager';
import { SampleStore } from './audio/sample/SampleStore';
import { TrackStore } from './audio/track/TrackStore';
import { NamespacedResourceStore, OnlineStore, ResourceStore } from './io/ResourceStore';
import { TextureStore } from './graphics/textures/TextureStore';

/** Where generated assets (scripts/prepare-assets.mjs) are served from. */
export const ASSET_ROOT = `${import.meta.env?.BASE_URL ?? '/'}assets`.replace(/\/\//g, '/');

export abstract class Game extends Container {
  private readonly contentContainer: Container;

  /** Framework-level overlays (draw-size preserved at 1280x960) sit above the game content. */
  protected readonly overlayContent: DrawSizePreservingFillContainer;

  protected override get content(): Container {
    return this.contentContainer;
  }

  host: GameHost | null = null;

  /** The font store (Game.Fonts). Framework fonts (Roboto) live in a nested store, searched after the main store. */
  readonly fonts = new FontStore();

  private readonly localFonts = new FontStore();

  private gameDependencies!: DependencyContainer;

  /** The resources of this game. The game layer adds its stores (e.g. osu-resources); framework stores namespace into it. */
  protected resources!: ResourceStore<Blob>;

  textures!: TextureStore;

  audio!: AudioManager;

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    return this.gameDependencies = new DependencyContainer(super.createChildDependencies(parent));
  }

  /** Registers fonts in the order osu!framework's Game.load and osu!'s OsuGameBase.Load add them (see public/assets/Fonts/index.json). */
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    super.load(dependencies);

    this.resources = new ResourceStore<Blob>();

    this.textures = new TextureStore(new NamespacedResourceStore(this.resources, 'Textures'));
    this.textures.addTextureSource(new OnlineStore());
    this.gameDependencies.cache(this.textures);

    const tracks = new ResourceStore<Blob>();
    tracks.addStore(new NamespacedResourceStore(this.resources, 'Tracks'));
    tracks.addStore(new OnlineStore());

    const samples = new ResourceStore<Blob>();
    samples.addStore(new NamespacedResourceStore(this.resources, 'Samples'));
    samples.addStore(new OnlineStore());

    this.audio = new AudioManager(this.host!.audioThread, tracks, samples);
    this.gameDependencies.cache(this.audio);

    this.gameDependencies.cacheAs(TrackStore, this.audio.tracks);
    this.gameDependencies.cacheAs(SampleStore, this.audio.samples);

    this.fonts.addStore(this.localFonts);
    this.gameDependencies.cache(this.fonts);

    return fetch(`${ASSET_ROOT}/Fonts/index.json`)
      .then(r => r.json() as Promise<string[]>)
      .then(names => {
        for (const name of names) {
          const store = new GlyphStore(name, ASSET_ROOT);
          if (/\/Roboto(Condensed)?\//.test(name))
            this.localFonts.addGlyphStore(store);
          else
            this.fonts.addGlyphStore(store);
        }

        return this.fonts.loadAll();
      });
  }

  constructor() {
    super();

    this.relativeSizeAxes = Axes.Both;

    super.addInternal(this.contentContainer = new Container().with({
      anchor: Anchor.Centre,
      origin: Anchor.Centre,
      relativeSizeAxes: Axes.Both,
    }));

    const overlay = new DrawSizePreservingFillContainer().with({ relativeSizeAxes: Axes.Both });
    overlay.targetDrawSize = new Vector2(1280, 960);
    super.addInternal(this.overlayContent = overlay);
  }

  protected override addInternal(_drawable: Drawable): void {
    throw new Error('Use add or content instead.');
  }

  /** @internal */
  setHost(host: GameHost): void {
    this.host = host;
  }
}
