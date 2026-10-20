// Screenshot a named app state at the same size as docs/reference/real (1389x868).
// usage: node scripts/shot.mjs --state songselect --out /tmp/ss.png [--url http://127.0.0.1:5173] [--wait 1500] [--w 1389 --h 868]
//        [--eval "await __osu.selectBeatmap(2)"]
// Requires the dev server (npm run dev) unless --url points elsewhere. States are implemented by window.__osu.goto().
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]] : acc), []),
);
const url = args.url ?? 'http://127.0.0.1:5173/';
const width = Number(args.w ?? 1389);
const height = Number(args.h ?? 868);
const out = args.out ?? 'shot.png';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(args.dpr ?? 1) });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__osu && window.__osu.ready, null, { timeout: 30000 });
await page.evaluate(() => window.__osu.ready);
if (args.state) await page.evaluate((s) => window.__osu.goto(s), args.state);
if (args.eval) await page.evaluate(`(async () => { ${args.eval} })()`);
await page.waitForTimeout(Number(args.wait ?? 1500));
await page.screenshot({ path: out });
await browser.close();

console.log(`saved ${out}`);
const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
if (errors.length) console.log('console errors:\n' + errors.join('\n'));
