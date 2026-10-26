// Ported from osu.Framework/Graphics/Effects/GlowEffect.cs

import { Vector2 } from '../../layout/Vector2';
import { Colour4 } from '../Colour4';
import { ColourInfo } from '../ColourInfo';
import { type BufferedContainer, EffectPlacement } from '../containers/BufferedContainer';
import { BlendingParameters } from '../DrawInfo';
import type { Drawable } from '../Drawable';
import { BlurEffect } from './BlurEffect';
import { type IEffect, withEffect } from './IEffect';

/** Creates a glow around the drawable this effect gets applied to. */
export class GlowEffect implements IEffect<BufferedContainer> {
  /** The strength of the glow. A higher strength means that the glow fades outward slower. Default is 1. */
  strength = 1;

  /** The sigma value for the blur of the glow. This controls how spread out the glow is. Default is 5 in both X and Y. */
  blurSigma = new Vector2(5);

  /** The color of the outline. Default is white. */
  colour = ColourInfo.singleColour(Colour4.White);

  /** The blending mode of the glow. Default is additive. */
  blending = BlendingParameters.Additive;

  /** Whether to draw the glow in front or behind the glowing Drawable. Default is in front. */
  placement = EffectPlacement.InFront;

  /** Whether to automatically pad by the glow extent such that no clipping occurs at the sides of the effect. Default is false. */
  padExtent = false;

  applyTo(drawable: Drawable): BufferedContainer {
    return withEffect(drawable, Object.assign(new BlurEffect(), {
      strength: this.strength,
      sigma: this.blurSigma,
      colour: this.colour,
      blending: this.blending,
      placement: this.placement,
      padExtent: this.padExtent,

      drawOriginal: true,
    }));
  }
}
