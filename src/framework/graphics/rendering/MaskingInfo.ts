// Ported from osu.Framework/Graphics/Rendering/MaskingInfo.cs

import type { Matrix3 } from '../../layout/Matrix3';
import type { RectangleF } from '../../layout/Primitives';
import { Vector2 } from '../../layout/Vector2';
import type { ColourInfo } from '../ColourInfo';

export interface MaskingInfo {
  /** (Quad.AABB, a RectangleI, in C#. The renderer takes the enclosing whole-pixel rectangle when it sets the scissor.) */
  screenSpaceAABB: RectangleF;
  maskingRect: RectangleF;

  toMaskingSpace: Matrix3;

  cornerRadius: number;
  cornerExponent: number;

  borderThickness: number;
  borderColour: ColourInfo | null;

  blendRange: number;
  alphaExponent: number;

  edgeOffset: Vector2;

  hollow: boolean;
  hollowCornerRadius: number;
}

export function maskingInfoEquals(left: MaskingInfo, right: MaskingInfo): boolean {
  return left === right || (
    left.screenSpaceAABB.equals(right.screenSpaceAABB)
    && left.maskingRect.equals(right.maskingRect)
    && left.toMaskingSpace.equals(right.toMaskingSpace)
    && left.cornerRadius === right.cornerRadius
    && left.cornerExponent === right.cornerExponent
    && left.borderThickness === right.borderThickness
    && (left.borderColour === right.borderColour || (left.borderColour !== null && right.borderColour !== null && left.borderColour.equals(right.borderColour)))
    && left.blendRange === right.blendRange
    && left.alphaExponent === right.alphaExponent
    && left.edgeOffset.equals(right.edgeOffset)
    && left.hollow === right.hollow
    && left.hollowCornerRadius === right.hollowCornerRadius);
}

export const NO_EDGE_OFFSET = Vector2.Zero;
