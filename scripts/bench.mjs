// Runs bench.html headless (no interactive input probes) and prints its JSON result.
// usage: node scripts/bench.mjs [--url http://127.0.0.1:5173] [--duration 2000] [--w 1389 --h 868]
// Requires the dev server (npm run dev). In cloud sessions set PW_CHROMIUM=/opt/pw-browsers/chromium.
// Headless Chromium draws with software GL and has no audio device: its numbers are for comparing variants with each other and for
// before/after checks of our own JavaScript time. They say nothing about a real GPU, display or audio output.
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);

const url = `${args.url ?? 'http://127.0.0.1:5173'}/bench.html?auto=1&duration=${args.duration ?? 2000}`;

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu'],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});
const page = await browser.newPage({ viewport: { width: Number(args.w ?? 1389), height: Number(args.h ?? 868) } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url);
await page.waitForFunction(() => window.__benchResult, null, { timeout: 300000 });

console.log(JSON.stringify(await page.evaluate(() => window.__benchResult), null, 1));
if (errors.length) console.error('page errors:\n' + errors.join('\n'));

await browser.close();
