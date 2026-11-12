// Stale-render check for the DOM renderer: does the page show what the scene graph says?
// The DOM renderer only rewrites an element when its drawable was invalidated. If state changes without invalidating, the element keeps
// showing the old state. This freezes the game at a state, takes a screenshot, re-applies every element from current state
// (GameHost.redrawAll) and takes another: any differing pixel is a stale render.
// usage: node scripts/stalecheck.mjs --state songselect [--url http://127.0.0.1:5173] [--wait 3000] [--eval "..."] [--out stale.png]
// Requires the dev server. Exits with code 1 when pixels differ; --out then holds the heat map and <out>.before.png / .after.png the frames.
// Canvas-drawn drawables redraw from live state on both passes, so they never show here; neither does anything drawn by a GLContainer.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]] : acc), []),
);
const url = args.url ?? 'http://127.0.0.1:5173/';
const out = args.out ?? 'stale.png';
const before = out.replace(/\.png$/, '.before.png');
const after = out.replace(/\.png$/, '.after.png');

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: Number(args.w ?? 1389), height: Number(args.h ?? 868) } });

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__osu && window.__osu.ready, null, { timeout: 30000 });
await page.evaluate(() => window.__osu.ready);
if (args.state) await page.evaluate((s) => window.__osu.goto(s), args.state);
if (args.eval) await page.evaluate(`(async () => { ${args.eval} })()`);
await page.waitForTimeout(Number(args.wait ?? 3000));

const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

await page.evaluate(() => window.__osu.suspend(true));
await settle();
await page.screenshot({ path: before });
await page.evaluate(() => window.__osu.redrawAll());
await settle();
await page.screenshot({ path: after });
await browser.close();

const pixeldiff = join(dirname(fileURLToPath(import.meta.url)), 'pixeldiff.mjs');

try {
  process.stdout.write(execFileSync(process.execPath, [pixeldiff, '--a', before, '--b', after, '--out', out, '--threshold', '0', '--fail', '0'], { encoding: 'utf8' }));
  console.log('no stale rendering');
} catch (e) {
  process.stdout.write(e.stdout ?? '');
  console.log(`STALE RENDER: see ${out} (heat map), ${before}, ${after}`);
  process.exit(1);
}
