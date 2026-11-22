// Timing checks that the page never blocks for more than 100 ms. They run in a
// project of their own, after every other test has finished (see
// playwright.config.ts): a long task is measured in wall-clock time, so other
// tests' browsers sharing the machine would make the page look slower than it is.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

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

test('Rotate PDF: turning every page, with 500 and then 1,000 drawn, blocks a CPU slowed four times for no more than 100 ms', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU slowing is a Chromium feature');
  test.setTimeout(240_000);
  const { execFileSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
  if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
  await page.goto('/rotate-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
  await page.locator('input[type=file]').first().setInputFiles(path);
  await expect(cells(page)).toHaveCount(500, { timeout: 120000 });
  // Let the grid finish drawing before the CPU is slowed and the presses measured.
  await page.waitForTimeout(2000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const measure = async () => {
    await page.evaluate(() => {
      const long: number[] = [];
      (window as unknown as { longTasks: number[] }).longTasks = long;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) long.push(entry.duration);
      }).observe({ type: 'longtask', buffered: false });
    });
    await page.getByRole('button', { name: 'Turn every page right' }).click();
    await page.waitForTimeout(1500);
    return page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks.filter((duration) => duration > 100));
  };
  expect(await measure()).toEqual([]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.getByRole('button', { name: 'Show pages 501 to 1,000' }).click();
  await expect(cells(page)).toHaveCount(1000);
  await page.waitForTimeout(2000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  expect(await measure()).toEqual([]);
});

test('Compress PDF: compressing the three scans blocks the page for no more than 100 ms at a time', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/compress-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
  await page.locator('input[type=file]').first().setInputFiles(join(here, '../fixtures/compress-scans.pdf'));
  await expect(page.locator('astro-island ol > li img')).toHaveCount(1, { timeout: 30000 });
  await page.evaluate(() => {
    const long: number[] = [];
    (window as unknown as { longTasks: number[] }).longTasks = long;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) long.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  await page.getByRole('button', { name: 'Compress and download' }).click();
  await expect(page.getByRole('heading', { name: 'Your compressed file is ready' })).toBeFocused({ timeout: 90000 });
  await page.waitForTimeout(500);
  const long = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
  expect(long.filter((duration) => duration > 100)).toEqual([]);
});

test('PDF to PNG: listing and converting the 500-page file blocks the page for no more than 100 ms at a time', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/pdf-to-png');
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
  await expect(page.locator('astro-island ol > li img')).toHaveCount(1, { timeout: 30000 });
  await page.getByRole('button', { name: 'Convert to PNG and download' }).click();
  await expect(page.getByRole('heading', { name: 'Your download is ready' })).toBeFocused({ timeout: 200000 });
  await expect(page.locator('astro-island section')).toContainText('500 files');
  await page.waitForTimeout(500);
  const long = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
  expect(long.filter((duration) => duration > 100)).toEqual([]);
});

test('Sign PDF: drawing a signature with the mouse blocks a CPU slowed four times for no more than 100 ms', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU slowing is a Chromium feature');
  await page.goto('/sign-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
  await page.locator('input[type=file]').first().setInputFiles(join(here, '../fixtures/text.pdf'));
  await expect(page.getByRole('radio', { name: 'Draw it', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('radio', { name: 'Draw it', exact: true }).check();
  const pad = page.getByRole('img', { name: 'Draw your signature' });
  await pad.scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island ol > li img')).toHaveCount(1, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const long: number[] = [];
    (window as unknown as { longTasks: number[] }).longTasks = long;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) long.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  const box = (await pad.boundingBox())!;
  // Ten strokes, each a loop of many small moves, as a signature is written.
  for (let stroke = 0; stroke < 10; stroke++) {
    await page.mouse.move(box.x + box.width * (0.05 + stroke * 0.09), box.y + box.height * 0.5);
    await page.mouse.down();
    for (let n = 1; n <= 40; n++) {
      const angle = (n / 40) * Math.PI * 2;
      await page.mouse.move(box.x + box.width * (0.05 + stroke * 0.09 + 0.04 * Math.sin(angle)), box.y + box.height * (0.5 - 0.35 * Math.sin(angle * 0.5) * Math.cos(angle)));
    }
    await page.mouse.up();
  }
  await page.getByRole('button', { name: 'Clear the drawing' }).click();
  await page.waitForTimeout(1000);
  const long = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(long.filter((duration) => duration > 100)).toEqual([]);
});
