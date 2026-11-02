import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60000);

async function openListing(page: Page, failSecondPage = false) {
  const offsets: number[] = [];
  let failed = false;
  await page.route('https://osu.direct/api/v2/search**', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0);
    offsets.push(offset);
    if (failSecondPage && offset === 50 && !failed) {
      failed = true;
      await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
      return;
    }
    await route.fulfill({ json: Array.from({ length: 50 }, (_, i) => ({
      id: offset + i + 1,
      title: `Song ${offset + i + 1}`,
      artist: 'Artist',
      creator: 'Mapper',
      status: 'ranked',
      covers: { 'cover@2x': 'https://assets.ppy.sh/cover.jpg', 'list@2x': 'https://assets.ppy.sh/list.jpg' },
      beatmaps: Array.from({ length: 5 }, (_, j) => ({
        id: (offset + i + 1) * 10 + j,
        mode_int: 0,
        difficulty_rating: j + 1,
        version: `Difficulty ${j + 1}`,
        total_length: 120,
      })),
    })) });
  });
  await page.route('https://assets.ppy.sh/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#78b4dc"/></svg>',
  }));
  await page.goto('/');
  await page.waitForFunction(() => window.__osu);
  await page.evaluate(() => window.__osu!.ready);
  await page.mouse.click(20, 100);
  await page.evaluate(() => window.__osu!.goto('beatmap-listing'));
  await expect.poll(() => cardCount(page)).toBe(50);
  return offsets;
}

async function cardCount(page: Page): Promise<number> {
  return page.evaluate(() => (window.__osu!.game as any).beatmapListing.foundContent?.children.length ?? 0);
}

test('builds difficulty rows only when a card is expanded and reuses them', async ({ page }) => {
  await openListing(page);
  const rows = () => page.evaluate(() => {
    const walk = (d: any): any[] => [d, ...(d.internalChildren ?? []).flatMap(walk)];
    return walk((window.__osu!.game as any).beatmapListing).filter(d => d.constructor.name === 'BeatmapCardDifficultyRow').length;
  });
  expect(await rows()).toBe(0);
  await page.evaluate(() => (window.__osu!.game as any).beatmapListing.scrollFlow.scrollTo(900, false));
  const point = await page.waitForFunction(() => {
    const walk = (d: any): any[] => [d, ...(d.internalChildren ?? []).flatMap(walk)];
    const row = walk((window.__osu!.game as any).beatmapListing).find(d => {
      const r = d.element.getBoundingClientRect();
      return d.constructor.name === 'BeatmapCardExtraInfoRow' && r.width > 0 && r.top > 200 && r.bottom < 600;
    });
    if (!row) return null;
    const r = row.element.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const { x, y } = await point.jsonValue();
  await page.mouse.move(x, y);
  await expect.poll(rows).toBe(5);
  await page.mouse.move(20, 100);
  await page.waitForTimeout(500);
  await page.mouse.move(x, y);
  await page.waitForTimeout(500);
  expect(await rows()).toBe(5);
});

test('appends successive pages while the search header stays offscreen', async ({ page }) => {
  const offsets = await openListing(page);
  for (const count of [100, 150]) {
    await page.evaluate(() => (window.__osu!.game as any).beatmapListing.scrollFlow.scrollToEnd());
    await expect.poll(() => cardCount(page), { timeout: 10000 }).toBe(count);
    expect(await page.evaluate(() => (window.__osu!.game as any).beatmapListing.scrollFlow.current)).toBeGreaterThan(1000);
  }
  expect(offsets).toEqual([0, 50, 100]);
});

test('retries a failed next page without losing its cursor or duplicating cards', async ({ page }) => {
  const offsets = await openListing(page, true);
  await page.evaluate(() => (window.__osu!.game as any).beatmapListing.scrollFlow.scrollToEnd());
  await expect.poll(() => cardCount(page), { timeout: 15000 }).toBe(100);
  expect(offsets).toEqual([0, 50, 50]);
  expect(await page.evaluate(() => new Set((window.__osu!.game as any).beatmapListing.foundContent.children.map((c: any) => c.beatmapSet.onlineID)).size)).toBe(100);
});

test('loaded card art keeps the same horizontal mask during small scroll movements', async ({ page }) => {
  await openListing(page);
  await page.evaluate(() => (window.__osu!.game as any).beatmapListing.scrollFlow.scrollTo(900, false));
  await page.waitForFunction(() => {
    const b = (window.__osu!.game as any).beatmapListing;
    const walk = (d: any): any[] => [d, ...(d.internalChildren ?? []).flatMap(walk)];
    return walk(b).some(d => d.constructor.name === 'OnlineBeatmapSetCover' && !d.isMaskedAway && d.element.style.maskImage.includes('to right'));
  });
  const result = await page.evaluate(async () => {
    const b = (window.__osu!.game as any).beatmapListing;
    const walk = (d: any): any[] => [d, ...(d.internalChildren ?? []).flatMap(walk)];
    // Choose a loaded cover away from the viewport edges so visibility culling isn't under test.
    const cover = walk(b).find(d => {
      const r = d.element.getBoundingClientRect();
      return d.constructor.name === 'OnlineBeatmapSetCover' && d.element.style.maskImage.includes('to right') && r.top > 250 && r.bottom < 650;
    });
    if (!cover) throw new Error('No loaded cover in the middle of the viewport');
    const masks = new Set<string>();
    let styleChanges = 0;
    const observer = new MutationObserver(records => styleChanges += records.length);
    observer.observe(cover.element, { attributes: true, attributeFilter: ['style'] });
    for (let i = 0; i < 60; i++) {
      b.scrollFlow.scrollTo(900 + Math.sin(i / 7) * 10, false);
      await new Promise(requestAnimationFrame);
      masks.add(cover.element.style.maskImage);
    }
    observer.disconnect();
    return { masks: [...masks], styleChanges };
  });
  expect(result.masks).toHaveLength(1);
  expect(result.masks[0]).toContain('to right');
  expect(result.masks[0]).not.toContain('url(');
  expect(result.styleChanges).toBe(0);
});
