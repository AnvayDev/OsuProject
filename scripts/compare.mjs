// Side-by-side + difference composite of a reference screenshot and ours.
// usage: node scripts/compare.mjs --ref docs/reference/real/04-songselect.jpg --ours /tmp/ss.png --out /tmp/cmp.png
// Output: [reference | ours] on top, [50% overlay | abs difference] below, all at the reference size.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const toDataUrl = (p) => `data:image/${extname(p).slice(1).replace('jpg', 'jpeg')};base64,${readFileSync(p).toString('base64')}`;
const ref = toDataUrl(args.ref);
const ours = toDataUrl(args.ours);

const browser = await chromium.launch();
const page = await browser.newPage();
const size = await page.evaluate(async ({ ref, ours }) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [a, b] = await Promise.all([load(ref), load(ours)]);
  const w = a.width, h = a.height;
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  const g = c.getContext('2d');
  g.drawImage(a, 0, 0, w, h);
  g.drawImage(b, w, 0, w, h);
  g.globalAlpha = 0.5; g.drawImage(a, 0, h, w, h); g.drawImage(b, 0, h, w, h); g.globalAlpha = 1;
  g.drawImage(a, w, h, w, h);
  g.globalCompositeOperation = 'difference';
  g.drawImage(b, w, h, w, h);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#ff66aa'; g.font = 'bold 20px sans-serif';
  g.fillText('REFERENCE', 10, 24); g.fillText('OURS', w + 10, 24); g.fillText('OVERLAY', 10, h + 24); g.fillText('DIFFERENCE', w + 10, h + 24);
  document.body.style.margin = '0';
  document.body.appendChild(c);
  return { w: c.width, h: c.height };
}, { ref, ours });
await page.setViewportSize({ width: size.w, height: size.h });
await page.locator('canvas').screenshot({ path: args.out ?? 'compare.png' });
await browser.close();
console.log(`saved ${args.out ?? 'compare.png'}`);
