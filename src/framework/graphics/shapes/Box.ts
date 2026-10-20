// Ported from osu.Framework/Graphics/Shapes/Box.cs

import type { IReadOnlyDependencyContainer } from '../../allocation/DependencyContainer';
import { Vector2 } from '../../layout/Vector2';
import { Sprite } from '../sprites/Sprite';
import { Texture } from '../textures/Texture';

/** A simple rectangular box. Can be colored using the colour property. */
export class Box extends Sprite {
  constructor() {
    super();

    // Setting the texture would normally set a size of (1, 1), but since the texture is set from BDL it needs to be set here instead.
    // RelativeSizeAxes may not behave as expected if this is not done.
    this.size = Vector2.One;
  }

  protected override load(dependencies: IReadOnlyDependencyContainer): void {
    super.load(dependencies);

    super.texture = Texture.WhitePixel;
  }

  override get texture(): Texture | null {
    return super.texture;
  }

  override set texture(_value: Texture | null) {
    throw new Error('The texture of a Box cannot be set.');
  }
}
