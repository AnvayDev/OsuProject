// Ported from osu.Framework/Game.cs (scene-graph structure only; resources/audio/config are wired by the game layer).

import { Container } from './graphics/containers/Container';
import { DrawSizePreservingFillContainer } from './graphics/containers/DrawSizePreservingFillContainer';
import type { Drawable } from './graphics/Drawable';
import { Anchor, Axes } from './layout/Enums';
import { Vector2 } from './layout/Vector2';
import type { GameHost } from './platform/GameHost';
import { DependencyContainer, type IReadOnlyDependencyContainer } from './allocation/DependencyContainer';
import { FontStore, GlyphStore } from './text/FontStore';

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

  protected override createChildDependencies(parent: IReadOnlyDependencyContainer): IReadOnlyDependencyContainer {
    return this.gameDependencies = new DependencyContainer(super.createChildDependencies(parent));
  }

  /** Registers fonts in the order osu!framework's Game.load and osu!'s OsuGameBase.Load add them (see public/assets/Fonts/index.json). */
  protected override load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    super.load(dependencies);

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
