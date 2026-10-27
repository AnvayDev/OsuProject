// Ported from osu.Framework/Graphics/Effects/BlurEffect.cs

import { MarginPadding } from '../../layout/MarginPadding';
import { Vector2 } from '../../layout/Vector2';
import { kernelSize } from '../../utils/Blur';
import { Colour4 } from '../Colour4';
import { ColourInfo } from '../ColourInfo';
import { BufferedContainer, EffectPlacement } from '../containers/BufferedContainer';
import { wrap } from '../containers/ContainerExtensions';
import { BlendingParameters } from '../DrawInfo';
import type { Drawable } from '../Drawable';
import type { IEffect } from './IEffect';

/** A blur effect that wraps a drawable in a BufferedContainer which applies a blur effect to it. */
export class BlurEffect implements IEffect<BufferedContainer> {
  /** The strength of the blur. Default is 1. */
  strength = 1;

  /** The sigma of the blur. Default is (2, 2). */
  sigma = new Vector2(2, 2);

  /** The rotation of the blur. Default is 0. */
  rotation = 0;

  /** The colour of the blur. Default is white. */
  colour = ColourInfo.singleColour(Colour4.White);

  /** The blending mode of the blur. Default is inheriting from the target drawable. */
  blending = BlendingParameters.Inherit;

  /** Whether to draw the blur in front or behind the original. Default is behind. */
  placement = EffectPlacement.Behind;

  /** Whether to draw the original target in addition to its blurred version. */
  drawOriginal = false;

  /** Whether to automatically pad by the blur extent such that no clipping occurs at the sides of the effect. Default is false. */
  padExtent = false;

  applyTo(drawable: Drawable): BufferedContainer {
    return wrap(new BufferedContainer().with({
      blurSigma: this.sigma,
      blurRotation: this.rotation,
      effectColour: this.colour.multiplyAlpha(this.strength),
      effectBlending: this.blending,
      effectPlacement: this.placement,

      drawOriginal: this.drawOriginal,

      padding: !this.padExtent
        ? new MarginPadding()
        : MarginPadding.of({
          horizontal: kernelSize(this.sigma.x),
          vertical: kernelSize(this.sigma.y),
        }),
    }), drawable);
  }
}
