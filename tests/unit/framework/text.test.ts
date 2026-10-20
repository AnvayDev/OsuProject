import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FontStore, GlyphStore } from '@fw/text/FontStore';
import { FontUsage } from '@fw/text/FontUsage';
import { TextBuilder, TruncatingTextBuilder } from '@fw/text/TextBuilder';

// Requires generated assets (npm run assets).
function store(...names: string[]) {
  const s = new FontStore();
  for (const n of names) {
    const g = new GlyphStore(`Fonts/${n}`, '/assets');
    g.setFont(JSON.parse(fs.readFileSync(`public/assets/Fonts/${n}.json`, 'utf8')));
    s.addGlyphStore(g);
  }
  return s;
}

const raw = (n: string) => JSON.parse(fs.readFileSync(`public/assets/Fonts/${n}.json`, 'utf8')) as { chars: number[][]; base: number };

describe('TextBuilder (BMFont metrics, scaleAdjust 100)', () => {
  const fonts = store('Torus/Torus-Regular', 'Torus/Torus-Bold', 'Noto/Noto-CJK-Basic');

  it('advances by xadvance/100 * size and positions glyphs at xoffset/yoffset', () => {
    const font = new FontUsage('Torus', 20, 'Regular');
    const b = new TextBuilder(fonts, font);
    b.addText('os');

    const chars = raw('Torus/Torus-Regular').chars;
    const o = chars.find(c => c[0] === 'o'.charCodeAt(0))!;
    const sChar = chars.find(c => c[0] === 's'.charCodeAt(0))!;

    expect(b.characters[0].drawRectangle.x).toBeCloseTo(o[5] / 100 * 20, 6);
    expect(b.characters[0].drawRectangle.y).toBeCloseTo(o[6] / 100 * 20, 6);
    expect(b.characters[0].drawRectangle.width).toBeCloseTo(o[3] / 100 * 20, 6);
    // kerning is 1/100 of the raw amount, not scaled by font size (osu!framework quirk)
    const kern = b.characters[1].getKerning(b.characters[0].glyph);
    expect(b.bounds.x).toBeCloseTo((o[7] + sChar[7]) / 100 * 20 + kern, 6);
    expect(b.bounds.y).toBe(20); // UseFullGlyphHeight: line height = font size
  });

  it('falls back across stores (CJK from Noto) and to the fallback character', () => {
    const b = new TextBuilder(fonts, new FontUsage('Torus', 20, 'Regular'), Number.MAX_VALUE, true, undefined, undefined, null, null, '•');
    b.addText('日');
    expect(b.characters).toHaveLength(1);
    expect(b.characters[0].texture.pageUrl).toContain('Noto-CJK-Basic');
  });

  it('weight lookup goes through FontName then FontNameNoFamily', () => {
    const b = new TextBuilder(fonts, new FontUsage('Torus', 20, 'Bold'));
    b.addText('a');
    expect(b.characters[0].texture.pageUrl).toContain('Torus-Bold');
  });

  it('truncates with an ellipsis that fits within maxWidth', () => {
    const b = new TruncatingTextBuilder(fonts, new FontUsage('Torus', 20, 'Regular'), 100, '…');
    b.addText('A very long truncated beatmap title');
    expect(b.isTruncated).toBe(true);
    expect(b.characters[b.characters.length - 1].character).toBe('…');
    expect(b.bounds.x).toBeLessThanOrEqual(100);
  });
});
