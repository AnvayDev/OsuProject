// Ported from osu.Game/Graphics/Backgrounds/BeatmapBackground.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import type { WorkingBeatmap } from '../../beatmaps/WorkingBeatmap';
import { Background } from './Background';

export class BeatmapBackground extends Background {
  readonly beatmap: WorkingBeatmap | null;

  private readonly fallbackTextureName: string;

  constructor(beatmap: WorkingBeatmap | null, fallbackTextureName = 'Backgrounds/bg1') {
    super();

    this.beatmap = beatmap;
    this.fallbackTextureName = fallbackTextureName;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    this.sprite.texture = (await this.beatmap?.getBackground()) ?? await dependencies.resolve(LargeTextureStore).get(this.fallbackTextureName);
  }

  override equals(other: Background | null): boolean {
    if (other === null) return false;
    if (this === other) return true;

    return other.constructor === this.constructor
      && (other as BeatmapBackground).beatmap === this.beatmap;
  }
}
