// Screenshot a named app state at the same size as docs/reference/real (1389x868).
// usage: node scripts/shot.mjs --state songselect --out /tmp/ss.png [--url http://127.0.0.1:5173] [--wait 1500] [--w 1389 --h 868]
//        [--eval "await __osu.selectBeatmap(2)"] [--renderer gl] [--canvas 1] [--mouse 300,250]
// --renderer gl draws with the WebGL renderer (?renderer=gl); --canvas 1 then saves the canvas itself (__osu.captureCanvas), which is what
// to use where WebGL is software-rendered (cloud): a page screenshot of a full-size canvas can take minutes there.
// Requires the dev server (npm run dev) unless --url points elsewhere. States are implemented by window.__osu.goto().
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]] : acc), []),
);
const url = (args.url ?? 'http://127.0.0.1:5173/') + (args.renderer === 'gl' ? '?renderer=gl' : '');
const width = Number(args.w ?? 1389);
const height = Number(args.h ?? 868);
const out = args.out ?? 'shot.png';

// PW_CHROMIUM lets cloud sessions use the preinstalled browser when the playwright package pins a different build.
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(args.dpr ?? 1) });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__osu && window.__osu.ready, null, { timeout: 30000 });
await page.evaluate(() => window.__osu.ready);
if (args.mouse) await page.mouse.move(...args.mouse.split(',').map(Number));
if (args.state) await page.evaluate((s) => window.__osu.goto(s), args.state);
if (args.eval) await page.evaluate(`(async () => { ${args.eval} })()`);
await page.waitForTimeout(Number(args.wait ?? 1500));
// --frames N: also wait until the game has run N more frames (software-rendered WebGL runs a few frames per second, so a fixed time
// doesn't say how far the game got).
if (args.frames) {
  await page.evaluate((n) => new Promise((resolve) => {
    const host = window.__osu.game.host;
    let last = host.lastFrameStart, count = 0;
    const tick = () => {
      if (host.lastFrameStart !== last) { last = host.lastFrameStart; count++; }
      if (count >= n) resolve(); else requestAnimationFrame(tick);
    };
    tick();
  }), Number(args.frames));
}
if (args.canvas) {
  const data = await page.evaluate(() => window.__osu.captureCanvas());
  writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
} else
  await page.screenshot({ path: out, timeout: 120000 });
await browser.close();

console.log(`saved ${out}`);
const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
if (errors.length) console.log('console errors:\n' + errors.join('\n'));
