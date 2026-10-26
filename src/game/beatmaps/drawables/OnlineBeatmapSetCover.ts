// Ported from osu.Game/Beatmaps/Drawables/OnlineBeatmapSetCover.cs

import type { IReadOnlyDependencyContainer } from '@fw/allocation/DependencyContainer';
import { Sprite } from '@fw/graphics/sprites/Sprite';
import { LargeTextureStore } from '@fw/graphics/textures/TextureStore';
import type { APIBeatmapSet } from '../../online/api/requests/responses/APIBeatmapSet';

export enum BeatmapSetCoverType {
  Cover,
  Card,
  List,
}

export class OnlineBeatmapSetCover extends Sprite {
  private readonly set: APIBeatmapSet;
  private readonly type: BeatmapSetCoverType;

  constructor(set: APIBeatmapSet, type = BeatmapSetCoverType.Cover) {
    super();

    this.set = set;
    this.type = type;
  }

  protected override async load(dependencies: IReadOnlyDependencyContainer): Promise<void> {
    await super.load(dependencies);

    let resource: string | null = null;

    switch (this.type) {
      case BeatmapSetCoverType.Cover:
        resource = this.set.covers.cover;
        break;

      case BeatmapSetCoverType.Card:
        resource = this.set.covers.card;
        break;

      case BeatmapSetCoverType.List:
        resource = this.set.covers.list;
        break;
    }

    if (resource !== null)
      this.texture = await dependencies.resolve(LargeTextureStore).get(resource);
  }
}
