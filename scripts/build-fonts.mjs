// Converts osu-resources BMFont binary fonts (Fonts/**/<name>.bin + <name>_<n>.png) into JSON metrics + copied pages under
// public/assets/Fonts/, mirroring the osu-resources paths. Parses BMFont binary format v3 (what SharpFNT/GlyphStore read).
// usage: node scripts/build-fonts.mjs [fontPath ...]   (defaults to the fonts osu.Game registers in OsuGameBase.Load)
import fs from 'node:fs';
import path from 'node:path';

// Font assets come from osu-resources (osu.Game) and osu-framework (framework fonts); both mirror to public/assets/Fonts.
const sources = [path.resolve('_reference/osu-resources/osu.Game.Resources'), path.resolve('_reference/osu-framework/osu.Framework/Resources')];
const out = path.resolve('public/assets');

// Registration order = FontStore lookup order: osu!framework Game.load adds FontAwesome to the main store first, then
// OsuGameBase.Load adds osu!'s fonts. Roboto lives in the framework's nested store (looked up after all of these).
const defaults = [
  'Fonts/FontAwesome5/FontAwesome-Solid', 'Fonts/FontAwesome5/FontAwesome-Regular', 'Fonts/FontAwesome5/FontAwesome-Brands',
  'Fonts/Torus/Torus-Regular', 'Fonts/Torus/Torus-Light', 'Fonts/Torus/Torus-SemiBold', 'Fonts/Torus/Torus-Bold',
  'Fonts/Torus-Alternate/Torus-Alternate-Regular', 'Fonts/Torus-Alternate/Torus-Alternate-Light',
  'Fonts/Torus-Alternate/Torus-Alternate-SemiBold', 'Fonts/Torus-Alternate/Torus-Alternate-Bold',
  'Fonts/Inter/Inter-Regular', 'Fonts/Inter/Inter-RegularItalic', 'Fonts/Inter/Inter-Light', 'Fonts/Inter/Inter-LightItalic',
  'Fonts/Inter/Inter-SemiBold', 'Fonts/Inter/Inter-SemiBoldItalic', 'Fonts/Inter/Inter-Bold', 'Fonts/Inter/Inter-BoldItalic',
  'Fonts/Noto/Noto-Basic', 'Fonts/Noto/Noto-Bopomofo', 'Fonts/Noto/Noto-CJK-Basic', 'Fonts/Noto/Noto-CJK-Compatibility', 'Fonts/Noto/Noto-Hangul', 'Fonts/Noto/Noto-Thai',
  'Fonts/Venera/Venera-Light', 'Fonts/Venera/Venera-Bold', 'Fonts/Venera/Venera-Black',
  'Fonts/Roboto/Roboto-Regular', 'Fonts/Roboto/Roboto-RegularItalic', 'Fonts/Roboto/Roboto-Bold', 'Fonts/Roboto/Roboto-BoldItalic',
  'Fonts/RobotoCondensed/RobotoCondensed-Regular', 'Fonts/RobotoCondensed/RobotoCondensed-Bold',
];

function parseBin(buf) {
  if (buf.toString('latin1', 0, 3) !== 'BMF' || buf[3] !== 3) throw new Error('not a BMFont v3 binary');
  let o = 4;
  const font = { info: {}, common: {}, pages: [], chars: [], kernings: [] };
  const cstr = (start, end) => {
    const z = buf.indexOf(0, start);
    return buf.toString('utf8', start, z >= 0 && z < end ? z : end);
  };

  while (o < buf.length) {
    const type = buf[o];
    const size = buf.readInt32LE(o + 1);
    const b = o + 5;

    switch (type) {
      case 1: {
        font.info = { size: buf.readInt16LE(b), face: cstr(b + 14, b + size) };
        // Some osu-resources files (e.g. Noto-Basic) declare an info block one byte longer than its content.
        // SharpFNT reads blocks sequentially, so continue right after the font name's terminator.
        o = buf.indexOf(0, b + 14) + 1;
        continue;
      }
      case 2:
        font.common = { lineHeight: buf.readUInt16LE(b), base: buf.readUInt16LE(b + 2), scaleW: buf.readUInt16LE(b + 4), scaleH: buf.readUInt16LE(b + 6), pages: buf.readUInt16LE(b + 8) };
        break;
      case 3: {
        let p = b;
        while (p < b + size) {
          const z = buf.indexOf(0, p);
          font.pages.push(buf.toString('utf8', p, z));
          p = z + 1;
        }
        break;
      }
      case 4:
        for (let p = b; p < b + size; p += 20) {
          font.chars.push([
            buf.readUInt32LE(p), buf.readUInt16LE(p + 4), buf.readUInt16LE(p + 6), buf.readUInt16LE(p + 8), buf.readUInt16LE(p + 10),
            buf.readInt16LE(p + 12), buf.readInt16LE(p + 14), buf.readInt16LE(p + 16), buf[p + 18],
          ]);
        }
        break;
      case 5:
        for (let p = b; p < b + size; p += 10)
          font.kernings.push([buf.readUInt32LE(p), buf.readUInt32LE(p + 4), buf.readInt16LE(p + 8)]);
        break;
    }

    o = b + size;
  }

  return font;
}

const fonts = process.argv.length > 2 ? process.argv.slice(2) : defaults;
const index = [];

for (const name of fonts) {
  // GlyphStore adds both the "fnt" and "bin" extensions (Torus-Alternate ships binary data as .fnt).
  const binPath = sources.flatMap(src => ['bin', 'fnt'].map(ext => path.join(src, `${name}.${ext}`))).find(p => fs.existsSync(p));
  if (binPath === undefined) {
    console.warn(`skip ${name} (missing)`);
    continue;
  }

  const font = parseBin(fs.readFileSync(binPath));
  const dir = path.join(out, path.dirname(name));
  fs.mkdirSync(dir, { recursive: true });

  // GlyphStore.GetFilenameForPage: {AssetName}_{page padded to the digit count of (pageCount - 1)}.png
  const digits = String(Math.max(0, font.pages.length - 1)).length;
  const pageFiles = font.pages.map((_, i) => `${path.basename(name)}_${String(i).padStart(digits, '0')}.png`);
  for (const f of pageFiles)
    fs.copyFileSync(path.join(path.dirname(binPath), f), path.join(dir, f));

  const json = {
    // chars: [id, x, y, width, height, xoffset, yoffset, xadvance, page]
    size: font.info.size, base: font.common.base, lineHeight: font.common.lineHeight, scaleW: font.common.scaleW, scaleH: font.common.scaleH,
    pages: pageFiles, chars: font.chars, kernings: font.kernings,
  };
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(json));
  index.push(name);
  console.log(`${name}: size ${font.info.size}, base ${font.common.base}, ${font.chars.length} chars, ${font.kernings.length} kernings, ${pageFiles.length} pages`);
}

fs.writeFileSync(path.join(out, 'Fonts/index.json'), JSON.stringify(index, null, 1));
