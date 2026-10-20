import { describe, expect, it } from 'vitest';
import { Colour4 } from '@fw/graphics/Colour4';
import { ColourInfo, srgbMultiply } from '@fw/graphics/ColourInfo';
import { DefaultEasingFunction, Easing } from '@fw/transforms/Easing';
import { valueAt } from '@fw/transforms/Interpolation';
import { MarginPadding } from '@fw/layout/MarginPadding';
import { Vector2 } from '@fw/layout/Vector2';
import { Anchor } from '@fw/layout/Enums';

const linear = new DefaultEasingFunction(Easing.None);

describe('Colour4', () => {
  it('parses hex like osu!framework', () => {
    expect(Colour4.fromHex('#ff66aa').toHex()).toBe('#FF66AA');
    expect(Colour4.fromHex('f6a').toHex()).toBe('#FF66AA');
    expect(Colour4.fromHex('ff66aa80').a).toBeCloseTo(128 / 255);
    expect(Colour4.tryParseHex('#12345')).toBeNull();
  });

  it('interpolates in linear space', () => {
    const mid = valueAt(50, Colour4.Black, Colour4.White, 0, 100, linear);
    // linear 0.5 -> sRGB ~0.7354
    expect(mid.r).toBeCloseTo(1.055 * Math.pow(0.5, 1 / 2.4) - 0.055, 6);
    expect(mid.a).toBe(1);
  });

  it('named colours match C#', () => {
    expect(Colour4.Transparent.equals(Colour4.fromBytes(255, 255, 255, 0))).toBe(true);
    expect(Colour4.YellowGreen.toHex()).toBe('#9ACD32');
  });
});

describe('SRGBColour/ColourInfo', () => {
  it('white is the identity for multiplication and multiplies alpha', () => {
    const c = Colour4.fromHex('#ff66aa');
    expect(srgbMultiply(Colour4.White, c)).toBe(c);
    expect(srgbMultiply(Colour4.White.opacity(0.5), c).a).toBe(0.5);
  });

  it('multiplies non-white colours in linear space', () => {
    const grey = new Colour4(0.5, 0.5, 0.5, 1);
    const r = srgbMultiply(grey, grey).r;
    const lin = Math.pow((0.5 + 0.055) / 1.055, 2.4);
    expect(r).toBeCloseTo(1.055 * Math.pow(lin * lin, 1 / 2.4) - 0.055, 6);
  });

  it('applyChild with gradients', () => {
    const parent = ColourInfo.singleColour(Colour4.White.opacity(0.5));
    const child = ColourInfo.gradientVertical(Colour4.Red, Colour4.Blue);
    const res = parent.applyChild(child);
    expect(res.hasSingleColour).toBe(false);
    expect(res.topLeft.r).toBe(1);
    expect(res.bottomLeft.b).toBe(1);
    expect(res.topLeft.a).toBe(0.5);
  });
});

describe('MarginPadding / Vector2 / Anchor', () => {
  it('object-initializer form', () => {
    const mp = MarginPadding.of({ horizontal: 10, top: 5 });
    expect([mp.top, mp.left, mp.bottom, mp.right]).toEqual([5, 10, 0, 10]);
    expect(mp.total.equals(new Vector2(20, 5))).toBe(true);
    expect(new MarginPadding(3).totalVertical).toBe(6);
  });

  it('interpolates per side', () => {
    const r = valueAt(50, new MarginPadding(0), new MarginPadding(10), 0, 100, linear);
    expect(r.left).toBe(5);
  });

  it('anchor flags match C#', () => {
    expect(Anchor.Centre).toBe(2 | 16);
    expect(Anchor.BottomRight & Anchor.x2).toBeTruthy();
  });
});
