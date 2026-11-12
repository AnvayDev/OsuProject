// Numeric pixel difference of two images of the same size, with a heat map.
// usage: node scripts/pixeldiff.mjs --a one.png --b two.png [--out diff.png] [--threshold 8] [--fail 0.5]
//   --threshold  per-channel difference (0-255) above which a pixel counts as different (default 8)
//   --fail       exit with code 1 if more than this percentage of pixels differ
// Prints JSON: { width, height, differing, percent, maxDelta, meanDelta, bounds }.
// Used to compare our renders with each other (DOM against WebGL, before against after a change, a live frame against a forced full
// redraw to catch stale rendering) and, with a looser threshold, against docs/reference/real.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);

if (!args.a || !args.b) {
  console.error('usage: node scripts/pixeldiff.mjs --a one.png --b two.png [--out diff.png] [--threshold 8] [--fail 0.5]');
  process.exit(2);
}

const toDataUrl = (p) => `data:image/${extname(p).slice(1).replace('jpg', 'jpeg')};base64,${readFileSync(p).toString('base64')}`;

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();

const result = await page.evaluate(async ({ a, b, threshold }) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);

  if (ia.width !== ib.width || ia.height !== ib.height)
    return { error: `sizes differ: ${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };

  const w = ia.width, h = ia.height;
  const pixels = (img) => {
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, w, h).data;
  };

  const da = pixels(ia), db = pixels(ib);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d');
  const heat = g.createImageData(w, h);

  let differing = 0, maxDelta = 0, sum = 0;
  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let i = 0, p = 0; i < da.length; i += 4, p++) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
    sum += d;
    if (d > maxDelta) maxDelta = d;

    // heat map: the first image dimmed, differences in red scaled by their size.
    const grey = (da[i] + da[i + 1] + da[i + 2]) / 3 * 0.25;
    heat.data[i] = heat.data[i + 1] = heat.data[i + 2] = grey;
    heat.data[i + 3] = 255;

    if (d > threshold) {
      differing++;
      heat.data[i] = 255;
      heat.data[i + 1] = heat.data[i + 2] = 255 - Math.min(255, d * 4);
      const x = p % w, y = (p / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  g.putImageData(heat, 0, 0);
  document.body.style.margin = '0';
  document.body.appendChild(out);

  return {
    width: w, height: h, differing, percent: +(differing / (w * h) * 100).toFixed(4), maxDelta, meanDelta: +(sum / (w * h)).toFixed(4),
    bounds: differing ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
  };
}, { a: toDataUrl(args.a), b: toDataUrl(args.b), threshold: Number(args.threshold ?? 8) });

if (result.error) {
  console.error(result.error);
  await browser.close();
  process.exit(2);
}

if (args.out) {
  await page.setViewportSize({ width: result.width, height: result.height });
  await page.locator('canvas').screenshot({ path: args.out });
}

await browser.close();
console.log(JSON.stringify(result));

if (args.fail !== undefined && result.percent > Number(args.fail))
  process.exit(1);
