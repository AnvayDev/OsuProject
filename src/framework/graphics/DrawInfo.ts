// Ported from osu.Framework/Graphics/DrawInfo.cs, DrawColourInfo.cs, BlendingParameters.cs (presets only)
// and osu.Framework/Graphics/Effects/EdgeEffectParameters.cs + EdgeEffectType.cs.

import { Matrix3 } from '../layout/Matrix3';
import { Precision } from '../layout/Primitives';
import { Vector2 } from '../layout/Vector2';
import type { IEasingFunction } from '../transforms/Easing';
import { valueAtNumber, type IInterpolable } from '../transforms/Interpolation';
import { Colour4 } from './Colour4';
import { ColourInfo } from './ColourInfo';

export class DrawInfo {
  constructor(readonly matrix: Matrix3 = Matrix3.identity(), readonly matrixInverse: Matrix3 = Matrix3.identity()) {}

  clone(): DrawInfo {
    return new DrawInfo(this.matrix.clone(), this.matrixInverse.clone());
  }

  /** Applies a transformation to the current DrawInfo (mutates; C# operates on a struct copy). */
  applyTransform(translation: Vector2, scale: Vector2, rotation: number, shear: Vector2, origin: Vector2): void {
    if (!translation.equals(Vector2.Zero)) {
      this.matrix.translateFromLeft(translation);
      this.matrixInverse.translateFromRight(translation.neg());
    }

    if (rotation !== 0) {
      const radians = rotation * Math.PI / 180;
      this.matrix.rotateFromLeft(radians);
      this.matrixInverse.rotateFromRight(-radians);
    }

    if (!shear.equals(Vector2.Zero)) {
      this.matrix.shearFromLeft(shear.neg());
      this.matrixInverse.shearFromRight(shear);
    }

    if (!scale.equals(Vector2.One)) {
      // Zero scale leads to unexpected input and autosize calculations, so it's clamped to a sane value.
      let sx = scale.x;
      let sy = scale.y;
      if (Math.abs(sx) < Precision.FLOAT_EPSILON) sx = Math.sign(sx === 0 ? 1 : sx) * Precision.FLOAT_EPSILON;
      if (Math.abs(sy) < Precision.FLOAT_EPSILON) sy = Math.sign(sy === 0 ? 1 : sy) * Precision.FLOAT_EPSILON;

      this.matrix.scaleFromLeft(new Vector2(sx, sy));
      this.matrixInverse.scaleFromRight(new Vector2(1 / sx, 1 / sy));
    }

    if (!origin.equals(Vector2.Zero)) {
      this.matrix.translateFromLeft(origin.neg());
      this.matrixInverse.translateFromRight(origin);
    }
  }

  equals(other: DrawInfo): boolean {
    return this.matrix.equals(other.matrix);
  }
}

/**
 * Blending presets used by osu! (BlendingParameters.None/Inherit/Mixture/Additive).
 * Every preset sets all of its fields, so CopyFromParent + ApplyDefaultToInherited reduce to:
 * Inherit takes the parent's resolved mode, and the root resolves to Mixture.
 */
export enum BlendingParameters {
  Inherit,
  None,
  Mixture,
  Additive,
}

export class DrawColourInfo {
  constructor(
    readonly colour: ColourInfo = ColourInfo.singleColour(Colour4.White),
    readonly blending: BlendingParameters = BlendingParameters.Inherit,
  ) {}

  equals(other: DrawColourInfo): boolean {
    return this.colour.equals(other.colour) && this.blending === other.blending;
  }
}

export enum EdgeEffectType {
  None,
  Glow,
  Shadow,
}

export interface EdgeEffectInit {
  colour?: Colour4;
  offset?: Vector2;
  type?: EdgeEffectType;
  roundness?: number;
  radius?: number;
  hollow?: boolean;
}

/** Parametrizes the appearance of an edge effect. Immutable (C# struct). */
export class EdgeEffectParameters implements IInterpolable<EdgeEffectParameters> {
  /** Colour of the edge effect. */
  readonly colour: Colour4;
  /** Positional offset applied to the edge effect. Useful for shadows. */
  readonly offset: Vector2;
  /** The type of the edge effect. */
  readonly type: EdgeEffectType;
  /** How round the edge effect should appear. Adds to the CornerRadius of the corresponding CompositeDrawable. */
  readonly roundness: number;
  /** How "thick" the edge effect is around the CompositeDrawable. In other words: at what distance the edge effect fades to complete transparency. */
  readonly radius: number;
  /** Whether the inside of the EdgeEffect rectangle should be empty. */
  readonly hollow: boolean;

  constructor(init: EdgeEffectInit = {}) {
    // default(EdgeEffectParameters): all fields zeroed (Colour = transparent black).
    this.colour = init.colour ?? new Colour4(0, 0, 0, 0);
    this.offset = init.offset ?? Vector2.Zero;
    this.type = init.type ?? EdgeEffectType.None;
    this.roundness = init.roundness ?? 0;
    this.radius = init.radius ?? 0;
    this.hollow = init.hollow ?? false;
  }

  with(init: EdgeEffectInit): EdgeEffectParameters {
    return new EdgeEffectParameters({ colour: this.colour, offset: this.offset, type: this.type, roundness: this.roundness, radius: this.radius, hollow: this.hollow, ...init });
  }

  /** Note: like C#, Hollow does not participate in equality. */
  equals(other: EdgeEffectParameters): boolean {
    return this.colour.equals(other.colour) && this.offset.equals(other.offset) && this.type === other.type
      && this.roundness === other.roundness && this.radius === other.radius;
  }

  /** Ported from Interpolation.GenericInterpolation.ValueAt(EdgeEffectParameters). */
  valueAt(time: number, startParams: EdgeEffectParameters, endParams: EdgeEffectParameters, startTime: number, endTime: number, easing: IEasingFunction): EdgeEffectParameters {
    return new EdgeEffectParameters({
      type: startParams.type,
      hollow: startParams.hollow,
      colour: startParams.colour.valueAt(time, startParams.colour, endParams.colour, startTime, endTime, easing),
      offset: startParams.offset.valueAt(time, startParams.offset, endParams.offset, startTime, endTime, easing),
      radius: valueAtNumber(time, startParams.radius, endParams.radius, startTime, endTime, easing),
      roundness: valueAtNumber(time, startParams.roundness, endParams.roundness, startTime, endTime, easing),
    });
  }
}
