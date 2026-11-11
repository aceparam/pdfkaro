// Page thumbnails in Merge PDF's list, in a real browser with the real PDF.js:
// what they show, when they are drawn, that they never hold up the job, and
// that they are forgotten with their files.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { expect, test, type Page, type Route } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, '../fixtures', name);

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Merge and download' });
const items = (page: Page) => page.locator('astro-island ol > li');
const pictures = (page: Page) => page.locator('astro-island ol img');
const blanks = (page: Page) => page.locator('astro-island ol [class*="blank"]');

async function open(page: Page) {
  await page.goto('/merge-pdf');
  await page.waitForLoadState('networkidle');
}

async function pick(page: Page, files: (string | { name: string; mimeType: string; buffer: Buffer })[]) {
  // Playwright takes paths or made-up files in one pick, not both, so every file goes in as bytes.
  await picker(page).setInputFiles(
    files.map((each) => (typeof each === 'string' ? { name: each, mimeType: 'application/pdf', buffer: readFileSync(fixture(each)) } : each)),
  );
  await expect(items(page).first()).toBeVisible();
  await expect(items(page).filter({ hasText: 'Getting ready' })).toHaveCount(0);
}

/** A PDF whose first page is wider than it is tall, made for the test. */
async function landscape(): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([842, 595]).drawText('A page on its side', { x: 60, y: 500, size: 30, font });
  return { name: 'wide.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

/** Holds PDF.js back until released, as a slow connection would. */
async function holdPdfjs(page: Page) {
  const held: Route[] = [];
  await page.context().route(/\/_astro\/pdf-[^/]+\.js$/, (route) => {
    held.push(route);
  });
  return {
    held,
    release: async () => {
      for (const route of held.splice(0)) await route.continue();
    },
  };
}

test.describe('what thumbnails show', () => {
  test('every readable file gets a picture of its first page; the damaged file keeps blank paper', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'scanned.pdf', 'images.pdf', 'restricted.pdf', 'damaged-cut.pdf']);
    await expect(pictures(page)).toHaveCount(4, { timeout: 20000 });
    const shown = await pictures(page).evaluateAll((all) =>
      all.map((image) => ({ src: (image as HTMLImageElement).src.slice(0, 5), width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight })),
    );
    for (const picture of shown) {
      expect(picture.src).toBe('blob:');
      expect(picture.width).toBeLessThanOrEqual(104);
      expect(picture.height).toBeLessThanOrEqual(136);
      expect(Math.max(picture.width, picture.height)).toBeGreaterThan(90);
    }
    // The damaged file's row has blank paper and no picture.
    const damaged = items(page).filter({ hasText: 'damaged-cut.pdf' });
    await expect(damaged.locator('img')).toHaveCount(0);
    await expect(damaged.locator('[class*="blank"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a protected file's picture comes only after the right password", async ({ page }) => {
    await open(page);
    await picker(page).setInputFiles([fixture('text.pdf'), fixture('password.pdf')]);
    await expect(page.getByLabel('Password for password.pdf')).toBeVisible();
    await expect(pictures(page)).toHaveCount(1, { timeout: 20000 });
    await expect(items(page).filter({ hasText: 'password.pdf' }).locator('img')).toHaveCount(0);
    await page.getByLabel('Password for password.pdf').fill('open-sesame');
    await page.keyboard.press('Enter');
    await expect(items(page).filter({ hasText: 'password.pdf' }).locator('img')).toHaveCount(1, { timeout: 20000 });
  });

  test('a page on its side is drawn wide, in the same space as the others', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', await landscape()]);
    await expect(pictures(page)).toHaveCount(2, { timeout: 20000 });
    const wide = items(page).filter({ hasText: 'wide.pdf' }).locator('img');
    const size = await wide.evaluate((image) => {
      const box = image.getBoundingClientRect();
      const slot = image.parentElement!.getBoundingClientRect();
      return { width: box.width, height: box.height, slotWidth: slot.width, slotHeight: slot.height };
    });
    expect(size.width).toBeGreaterThan(size.height);
    expect(size.slotWidth).toBe(52);
    expect(size.slotHeight).toBe(68);
  });
});

test.describe('when thumbnails are drawn', () => {
  test('with 30 files, only those near the screen are drawn until the visitor scrolls, with no long task @desktop', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    await page.evaluate(() => {
      const long: number[] = [];
      (window as unknown as { longTasks: number[] }).longTasks = long;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) long.push(entry.duration);
      }).observe({ type: 'longtask', buffered: false });
    });
    const text = readFileSync(fixture('text.pdf'));
    await pick(
      page,
      Array.from({ length: 30 }, (_, index) => ({ name: `part-${index + 1}.pdf`, mimeType: 'application/pdf', buffer: text })),
    );
    // Let drawing settle, then count.
    await expect(pictures(page).first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const near = await pictures(page).count();
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(15);
    await items(page).last().scrollIntoViewIfNeeded();
    await expect(items(page).last().locator('img')).toHaveCount(1, { timeout: 20000 });
    const long = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
    expect(long.filter((duration) => duration > 100)).toEqual([]);
  });

  test('nothing used to draw thumbnails loads before a pick', async ({ page }) => {
    const fetched: string[] = [];
    page.context().on('request', (request) => fetched.push(new URL(request.url()).pathname));
    await open(page);
    expect(fetched.filter((path) => /thumbnail-|\/pdf-|pdf\.worker|pdfjs-data/.test(path))).toEqual([]);
  });
});

test.describe('thumbnails never hold up the job', () => {
  test('with PDF.js held back, Merge and download merges at once', async ({ page }) => {
    const pdfjs = await holdPdfjs(page);
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf']);
    await expect.poll(() => pdfjs.held.length).toBeGreaterThan(0);
    await expect(blanks(page)).toHaveCount(2);
    await mainButton(page).click();
    await expect(page.getByRole('heading', { name: 'Your merged file is ready' })).toBeVisible({ timeout: 10000 });
    await pdfjs.release();
  });

  test('with PDF.js failing to load, the boxes stay blank and the merge works', async ({ page }) => {
    await page.context().route(/\/_astro\/(pdf-|pdf\.worker|pdfjs-data)[^/]*$/, (route) => route.abort());
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf']);
    await page.waitForTimeout(1500);
    await expect(pictures(page)).toHaveCount(0);
    await expect(blanks(page)).toHaveCount(2);
    await expect(page.getByRole('heading', { name: /did not finish/ })).toHaveCount(0);
    await mainButton(page).click();
    await expect(page.getByRole('heading', { name: 'Your merged file is ready' })).toBeVisible();
  });

  test('over 100 MB, with PDF.js held back, the warning shows and the merge finishes @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    const pdfjs = await holdPdfjs(page);
    await open(page);
    await picker(page).setInputFiles([large, fixture('text.pdf')]);
    await expect(page.getByRole('heading', { name: 'These files add up to more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(items(page).filter({ hasText: 'Getting ready' })).toHaveCount(0, { timeout: 60000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await mainButton(page).click();
    await expect(page.getByRole('heading', { name: 'Your merged file is ready' })).toBeVisible({ timeout: 60000 });
    await pdfjs.release();
  });
});

test.describe('thumbnails are pictures only', () => {
  test('they are hidden from screen readers, never focused, and not dragged on their own', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf']);
    await expect(pictures(page)).toHaveCount(2, { timeout: 20000 });
    // aria-hidden on the slot keeps the pictures out of the accessibility tree.
    await expect(page.getByRole('img')).toHaveCount(0);
    expect(await pictures(page).evaluateAll((all) => all.map((image) => (image as HTMLImageElement).draggable))).toEqual([false, false]);
    // Tab through the list: focus never lands on a picture or its slot.
    await items(page).first().getByRole('button', { name: 'Move text.pdf up' }).focus();
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('IMG');
    }
  });

  test('dragging an item by its picture moves the item @desktop', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf', 'scanned.pdf']);
    await expect(pictures(page)).toHaveCount(3, { timeout: 20000 });
    await items(page).nth(2).locator('img').dragTo(items(page).nth(0));
    const order = (await items(page).allInnerTexts()).map((text) => text.split('\n')[0]);
    expect(order).toEqual(['scanned.pdf', 'text.pdf', 'mixed.pdf']);
  });
});

test.describe('thumbnails are forgotten with their files', () => {
  /** The thumbnail addresses on the page now. */
  const addresses = (page: Page) => pictures(page).evaluateAll((all) => all.map((image) => (image as HTMLImageElement).src));
  /** Whether each address can still be opened. A revoked blob: address cannot. */
  const stillOpen = (page: Page, urls: string[]) =>
    page.evaluate(async (list) => Promise.all(list.map((url) => fetch(url).then(() => true, () => false))), urls);

  test('removing a file revokes its picture', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf']);
    await expect(pictures(page)).toHaveCount(2, { timeout: 20000 });
    const removed = await items(page).filter({ hasText: 'text.pdf' }).locator('img').getAttribute('src');
    await page.getByRole('button', { name: 'Remove text.pdf' }).click();
    await expect(pictures(page)).toHaveCount(1);
    expect(await stillOpen(page, [removed!])).toEqual([false]);
  });

  test('Start again and leaving the page revoke every picture', async ({ page }) => {
    await open(page);
    await pick(page, ['text.pdf', 'mixed.pdf']);
    await expect(pictures(page)).toHaveCount(2, { timeout: 20000 });
    let urls = await addresses(page);
    await mainButton(page).click();
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('astro-island img')).toHaveCount(0);
    expect(await stillOpen(page, urls)).toEqual([false, false]);

    await pick(page, ['text.pdf', 'scanned.pdf']);
    await expect(pictures(page)).toHaveCount(2, { timeout: 20000 });
    urls = await addresses(page);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await expect(page.locator('astro-island img')).toHaveCount(0);
    expect(await stillOpen(page, urls)).toEqual([false, false]);
  });
});
