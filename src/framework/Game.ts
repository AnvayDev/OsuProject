// Ported from osu.Framework/Game.cs (scene-graph structure only; resources/audio/config are wired by the game layer).

import { Container } from './graphics/containers/Container';
import { DrawSizePreservingFillContainer } from './graphics/containers/DrawSizePreservingFillContainer';
import type { Drawable } from './graphics/Drawable';
import { Anchor, Axes } from './layout/Enums';
import { Vector2 } from './layout/Vector2';
import type { GameHost } from './platform/GameHost';

export abstract class Game extends Container {
  private readonly contentContainer: Container;

  /** Framework-level overlays (draw-size preserved at 1280x960) sit above the game content. */
  protected readonly overlayContent: DrawSizePreservingFillContainer;

  protected override get content(): Container {
    return this.contentContainer;
  }

  host: GameHost | null = null;

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
