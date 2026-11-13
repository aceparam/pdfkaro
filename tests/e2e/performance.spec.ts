// Timing checks that the page never blocks for more than 100 ms. They run in a
// project of their own, after every other test has finished (see
// playwright.config.ts): a long task is measured in wall-clock time, so other
// tests' browsers sharing the machine would make the page look slower than it is.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const cells = (page: Page) => page.locator('astro-island ol > li');

test('Split PDF: listing and scrolling the 500-page file blocks the page for no more than 100 ms at a time', async ({ page }) => {
  await page.goto('/split-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
  await page.evaluate(() => {
    const long: number[] = [];
    (window as unknown as { longTasks: number[] }).longTasks = long;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) long.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  await page.locator('input[type=file]').first().setInputFiles(join(here, '../fixtures/pages-500.pdf'));
  await expect(cells(page)).toHaveCount(500, { timeout: 30000 });
  await cells(page).nth(250).scrollIntoViewIfNeeded();
  await cells(page).last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const long = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
  expect(long.filter((duration) => duration > 100)).toEqual([]);
});
