// Reorder pages in a real browser, at a phone width and a desktop width, with
// the real engine: moving pages by keyboard, button and drag, every state, and
// the promise that nothing about a file, or the order made, leaves the device.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, test, type Download, type Page } from '@playwright/test';
import { builtFiles, traces, violations, watch, type Seen } from './no-upload';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, '../fixtures', name);
const password = 'open-sesame';

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Reorder and download' });
const fileLine = (page: Page) => page.locator('p[tabindex="-1"]');
const orderLine = (page: Page) => page.locator('p[class*=toggleSummary]');
const cells = (page: Page) => page.locator('astro-island ol > li');
const earlier = (page: Page, n: number) => page.getByRole('button', { name: `Move page ${n} earlier`, exact: true });
const later = (page: Page, n: number) => page.getByRole('button', { name: `Move page ${n} later`, exact: true });
const captions = (page: Page) => page.locator('astro-island ol > li > div:nth-child(2)').allInnerTexts();
const status = (page: Page) => page.locator('[role=status]').first();
const original = 'The pages are in their original order. Press “Earlier” or “Later” under a page to move it.';
const changed = 'The order has changed. Press “Earlier” or “Later” under a page to move it.';

async function open(page: Page) {
  await page.goto('/rearrange-pdf-pages');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

async function pick(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await picker(page).setInputFiles(typeof file === 'string' ? fixture(file) : file);
}

async function drop(page: Page, names: string[]) {
  const files = names.map((name) => ({ name, data: readFileSync(fixture(name)).toString('base64') }));
  await page.evaluate((given) => {
    const transfer = new DataTransfer();
    for (const { name, data } of given) transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: 'application/pdf' }));
    for (const type of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

async function reorderAndDownload(page: Page): Promise<Download> {
  await mainButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your new file is ready' })).toBeFocused({ timeout: 60000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  return download;
}

const shapesOf = async (download: Download) =>
  (await PDFDocument.load(readFileSync((await download.path())!))).getPages().map((each) => [each.getWidth(), each.getHeight(), each.getRotation().angle]);

/** A plain file of `count` pages, made once in the temporary folder. */
async function plainPages(count: number): Promise<string> {
  const path = join(tmpdir(), `pdfkaro-${count}-pages.pdf`);
  if (!existsSync(path)) {
    const doc = await PDFDocument.create();
    for (let n = 0; n < count; n++) doc.addPage([200, 200]);
    writeFileSync(path, await doc.save());
  }
  return path;
}

async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const long: number[] = [];
    (window as unknown as { longTasks: number[] }).longTasks = long;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) long.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
}
const longTasks = (page: Page) => page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks.filter((duration) => duration > 100));

test.describe('moving pages and reordering', () => {
  test('shows the pages in their original order, with Earlier and Later on each, and the main button ready', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(fileLine(page)).toContainText('text.pdf, 3 pages');
    await expect(cells(page)).toHaveCount(3);
    await expect(orderLine(page)).toHaveText(original);
    await expect(earlier(page, 1)).toHaveAttribute('aria-disabled', 'true');
    await expect(later(page, 3)).toHaveAttribute('aria-disabled', 'true');
    await expect(later(page, 1)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: /^Remove page/ })).toHaveCount(0);
  });

  test('moves a page by keyboard, announces it, keeps focus on a usable button, and gives that order', async ({ page }) => {
    await open(page);
    await pick(page, 'mixed.pdf');
    await earlier(page, 3).focus();
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Page 3 moved to place 2 of 4.');
    await expect(earlier(page, 3)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Page 3 moved to place 1 of 4.');
    // Earlier can no longer be used, so focus moves to Later.
    await expect(later(page, 3)).toBeFocused();
    expect(await captions(page)).toEqual(['Page 3', 'Page 1', 'Page 2', 'Page 4']);
    await expect(orderLine(page)).toHaveText(changed);
    const download = await reorderAndDownload(page);
    expect(download.suggestedFilename()).toBe('mixed-reordered.pdf');
    await expect(page.getByText(/4 pages/)).toBeVisible();
    expect(await shapesOf(download)).toEqual([
      [420, 595, 90],
      [595, 842, 0],
      [792, 612, 0],
      [595, 842, 180],
    ]);
  });

  test('moving a page back says the order is original again', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await later(page, 1).click();
    await expect(orderLine(page)).toHaveText(changed);
    await earlier(page, 1).click();
    await expect(orderLine(page)).toHaveText(original);
  });

  test('drags a page onto another @desktop', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(cells(page)).toHaveCount(3);
    await cells(page).nth(2).dragTo(cells(page).nth(0));
    await expect(status(page)).toHaveText('Page 3 moved to place 1 of 3.');
    expect(await captions(page)).toEqual(['Page 3', 'Page 1', 'Page 2']);
  });

  test("the last page's unavailable Later moves nothing", async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    // It stays focusable but is unavailable: pressing it, by keyboard or by a forced tap, moves nothing.
    await later(page, 3).focus();
    await page.keyboard.press('Enter');
    await later(page, 3).click({ force: true });
    await expect(later(page, 3)).toBeFocused();
    expect(await captions(page)).toEqual(['Page 1', 'Page 2', 'Page 3']);
    await expect(orderLine(page)).toHaveText(original);
  });

  test('a page moved past the pages shown brings the next batch into view, with focus and the whole count', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await picker(page).setInputFiles(await plainPages(900));
    await expect(later(page, 500)).toBeVisible({ timeout: 60000 });
    await later(page, 500).focus();
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Page 500 moved to place 501 of 900.');
    await expect(later(page, 500)).toBeFocused();
    await expect(cells(page)).toHaveCount(900);
    await expect(later(page, 500)).toBeInViewport();
  });

  test('a one-page file has nothing to move, and can still be written', async ({ page }) => {
    await open(page);
    await pick(page, 'form.pdf');
    await expect(orderLine(page)).toHaveText('This file has one page, so there is nothing to move.');
    await expect(earlier(page, 1)).toHaveAttribute('aria-disabled', 'true');
    await expect(later(page, 1)).toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('the skip link takes a keyboard user past the pages', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(cells(page)).toHaveCount(3);
    await page.getByRole('link', { name: 'Skip to the main button' }).focus();
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused();
  });

  test('Cancel keeps the order', async ({ page }) => {
    await open(page);
    await pick(page, 'pages-500.pdf');
    await expect(earlier(page, 2)).toBeVisible({ timeout: 30000 });
    await earlier(page, 2).click();
    // Hold the job: each qpdf instance fetches its WebAssembly, so a fetch that never answers keeps the job running.
    await page.context().route(/\/_astro\/qpdf-[^/]+\.wasm$/, () => {});
    await mainButton(page).click();
    await expect(page.locator('p[class*=progressLine]')).toHaveText('Starting on 1 file');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeVisible();
    await expect(orderLine(page)).toHaveText(changed);
    expect((await captions(page)).slice(0, 2)).toEqual(['Page 2', 'Page 1']);
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password, then shows its pages', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused();
    await expect(cells(page)).toHaveCount(0);
    await expect(orderLine(page)).toHaveCount(0);
    await field.fill(password);
    await page.keyboard.press('Enter');
    await expect(cells(page)).toHaveCount(3);
  });

  test('a damaged file says so and offers to choose another', async ({ page }) => {
    await open(page);
    await pick(page, 'damaged-cut.pdf');
    await expect(page.getByRole('heading', { name: 'damaged-cut.pdf is damaged and cannot be read.' })).toBeVisible();
    await expect(cells(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.getByText('Choose a PDF file')).toBeVisible();
  });

  test('a file that is not a PDF is refused by name', async ({ page }) => {
    await open(page);
    await pick(page, 'not-a-pdf.pdf');
    await expect(page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
  });

  test('two files dropped at once: the first is listed, and the page says the other was not added', async ({ page }) => {
    await open(page);
    await drop(page, ['text.pdf', 'mixed.pdf']);
    await expect(fileLine(page)).toContainText('text.pdf, 3 pages');
    await expect(page.locator('p:not([role=status])', { hasText: 'This tool takes one file, so mixed.pdf was not added.' })).toBeVisible();
  });

  test('when the engine cannot be fetched, the page says so', async ({ page, context }) => {
    await context.route(/\/_astro\/rearrange-pdf-pages-/, (route) => route.abort());
    await open(page);
    await pick(page, 'text.pdf');
    await expect(page.getByRole('heading', { name: 'The new file was not made.' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });
});

test.describe('very many pages', () => {
  test('a file of 120,000 pages shows the notice, and moving a page blocks nothing for more than 100 ms @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(later(page, 1)).toBeVisible();
    await watchLongTasks(page);
    await later(page, 1).click();
    await expect(status(page)).toHaveText('Page 1 moved to place 2 of 120,000.');
    await later(page, 1).click();
    await expect(orderLine(page)).toHaveText(changed);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await longTasks(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Reorder pages' own files that may load after a pick, by exact name, read from the build. */
const filesAfterPick = () =>
  builtFiles(
    /^(ToolWorkspace\.[A-Za-z0-9_-]{8}\.js|FilePicker\.[A-Za-z0-9_-]{8}\.css|tool\.worker-[A-Za-z0-9_-]{8}\.js|rearrange-pdf-pages-[A-Za-z0-9_-]{8}\.js|plain-[A-Za-z0-9_-]{8}\.js|inspect-[A-Za-z0-9_-]{8}\.js|qpdf-[A-Za-z0-9_-]{8}\.(js|wasm)|thumbnail-[A-Za-z0-9_-]{8}\.js|pdf-[A-Za-z0-9_-]{8}\.js|pdf\.worker\.min-[A-Za-z0-9_-]{8}\.mjs|pdfjs-data-[A-Za-z0-9_-]{8}\.js)$/,
  );
const paths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];

test.describe('nothing is uploaded', () => {
  test('picks a protected file under a telling name, moves a page, reorders and downloads, with only the listed files fetched', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pick(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) });
    await page.getByLabel('Password for qz7report.pdf').fill(password);
    await page.keyboard.press('Enter');
    await later(page, 2).click();
    await expect(page.locator('astro-island ol img')).toHaveCount(3, { timeout: 20000 });
    const download = await reorderAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7report-reordered.pdf');

    const secrets = ['qz7report.pdf', 'qz7report', password];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = paths(seen);
    expect(fetched.some((path) => /\/rearrange-pdf-pages-/.test(path))).toBe(true);
    for (const other of [/\/fflate-/, /\/split-pdf-/, /\/merge-pdf-/, /\/extract-pdf-pages-/, /\/delete-pdf-pages-/]) expect(fetched.some((path) => other.test(path))).toBe(false);

    const held = await traces(page, context);
    expect(held).toMatchObject({ local: 0, session: 0, databases: 0, caches: 0, opfs: [], cookies: [] });
    for (const secret of secrets) {
      expect(held.title).not.toContain(secret);
      expect(decodeURIComponent(held.address)).not.toContain(secret);
      for (const line of consoleText) expect(line).not.toContain(secret);
    }
  });

  test('no bookmark title or attachment name reaches a request or the console', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pick(page, 'rich.pdf');
    await later(page, 1).click();
    await reorderAndDownload(page);
    expect(violations(seen, new URL(baseURL!).origin, ['Chapter one', 'Chapter two', 'note.txt'], filesAfterPick())).toEqual([]);
    for (const line of consoleText) expect(line).not.toMatch(/Chapter (one|two)|note\.txt/);
  });

  test('the hidden text of tagged.pdf reaches no request and no console line, and the address holds no order', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pick(page, 'tagged.pdf');
    await earlier(page, 2).click();
    await reorderAndDownload(page);
    const secrets = ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-LINK', 'SECRET-NOTE'];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    for (const line of consoleText) for (const secret of secrets) expect(line).not.toContain(secret);
    const address = new URL(page.url());
    expect(address.search).toBe('');
    expect(address.hash).toBe('');
  });
});
