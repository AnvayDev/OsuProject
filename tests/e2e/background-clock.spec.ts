// npm run e2e (or OSU_TEST_URL=http://127.0.0.1:5174 npm run e2e for an existing worktree server).
import { expect, test, type Page } from '@playwright/test';

async function openMenu(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__osu);
  await page.evaluate(() => window.__osu.ready);
  await page.mouse.click(20, 100); // Unlock audio in browsers that require a gesture.
  await page.evaluate(() => window.__osu.goto('mainmenu'));
  await page.waitForFunction(() => window.__osu.game.osuLogo.alpha === 1);
}

async function clickDrawable(page: Page, name: string) {
  const point = await page.evaluate(name => {
    const walk = d => [d, ...(d.internalChildren ?? []).flatMap(walk)];
    const drawable = walk(window.__osu.game).find(d => d.constructor.name === name);
    const r = drawable.element.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, name);
  await page.mouse.click(point.x, point.y);
}

async function clockState(page: Page) {
  return page.evaluate(() => {
    const walk = d => [d, ...(d.internalChildren ?? []).flatMap(walk)];
    const clock = walk(window.__osu.game).find(d => d.constructor.name === 'ToolbarClock');
    return { mode: clock.clockDisplayMode.value, analog: clock.analog.alpha, digital: clock.digital.alpha, runtime: clock.digital.showRuntime };
  });
}

async function backgroundPixel(page: Page): Promise<number[]> {
  const shot = await page.screenshot({ clip: { x: 690, y: 150, width: 1, height: 1 } });
  return page.evaluate(async data => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  }, `data:image/png;base64,${shot.toString('base64')}`);
}

test.setTimeout(60000);

test.beforeEach(async ({ page }) => {
  // Deterministic seasonal art: like assets.ppy.sh, the response has no CORS headers.
  await page.route('https://assets.ppy.sh/contests/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#78b4dc"/></svg>',
  }));
});

test('wallpaper stays visible when the logo dims it and when returning to the initial menu', async ({ page }) => {
  await openMenu(page);
  await expect.poll(async () => (await backgroundPixel(page))[2]).toBeGreaterThan(200);
  await clickDrawable(page, 'OsuLogo');
  // Wait for the real transition to settle, then inspect pixels rather than only DOM visibility.
  await page.waitForFunction(() => Math.abs(window.__osu.game.screenStack.backgroundScreenStack.currentScreen.colour.topLeft.r - 0.8) < 0.00001);
  const dimmed = await backgroundPixel(page);
  expect(dimmed[2]).toBeGreaterThan(150);
  expect(dimmed[2]).toBeLessThan(200);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await backgroundPixel(page))[2]).toBeGreaterThan(200);
});

test('clock cycles through every visible mode before and after reload', async ({ page }) => {
  await openMenu(page);
  await clickDrawable(page, 'OsuLogo');
  await page.waitForFunction(() => window.__osu.game.toolbar.y === 0);

  const modes = [
    { mode: 2, analog: 0, digital: 1, runtime: true },
    { mode: 1, analog: 0, digital: 1, runtime: false },
    { mode: 0, analog: 1, digital: 0, runtime: false },
    { mode: 3, analog: 1, digital: 1, runtime: true },
  ];
  for (const expected of modes) {
    await clickDrawable(page, 'ToolbarClock');
    await expect.poll(() => clockState(page)).toEqual(expected);
  }
  await page.waitForFunction(() => localStorage.getItem('game.ini')?.includes('ToolbarClockDisplayMode = 3'));
  await openMenu(page);
  await clickDrawable(page, 'OsuLogo');
  await page.waitForFunction(() => window.__osu.game.toolbar.y === 0);
  for (const expected of modes) {
    await clickDrawable(page, 'ToolbarClock');
    await expect.poll(() => clockState(page)).toEqual(expected);
  }
});
