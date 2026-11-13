// Split PDF in a real browser, at a phone width and a desktop width, with the
// real engine: marking cuts by mouse and keyboard, every state, very long
// files, and the promise that nothing about a file leaves the device.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, test, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { builtFiles, traces, violations, watch, type Seen } from './no-upload';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, '../fixtures', name);
const password = 'open-sesame';

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Split and download' });
const fileLine = (page: Page) => page.locator('p[tabindex="-1"]');
const cutLine = (page: Page) => page.locator('p[class*=cutSummary]');
const cells = (page: Page) => page.locator('astro-island ol > li');
const cut = (page: Page, n: number) => page.getByRole('button', { name: `Cut after page ${n}`, exact: true });
const status = (page: Page) => page.locator('[role=status]').first();
const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page) {
  await page.goto('/split-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

/** Picks one file and waits until its pages are listed. */
async function pick(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await picker(page).setInputFiles(typeof file === 'string' ? fixture(file) : file);
}

async function splitAndDownload(page: Page): Promise<Download> {
  await mainButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your files are ready' })).toBeFocused({ timeout: 60000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  return download;
}

async function unzip(download: Download): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(readFileSync((await download.path())!)));
}
const pagesIn = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

/** Hands files to the page as a drop, as several files dragged in at once would be. */
async function drop(page: Page, names: string[]) {
  const files = names.map((name) => ({ name, data: readFileSync(fixture(name)).toString('base64') }));
  await page.evaluate((given) => {
    const transfer = new DataTransfer();
    for (const { name, data } of given) transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: 'application/pdf' }));
    for (const type of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

async function paste(page: Page, name: string) {
  const data = readFileSync(fixture(name)).toString('base64');
  await page.evaluate(
    ([fileName, base64]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64!), (c) => c.charCodeAt(0))], fileName!, { type: 'application/pdf' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    },
    [name, data],
  );
}

/** The large files, made outside the repo once and kept for later runs. */
function generated(name: 'pdfkaro-many-pages.pdf' | 'pdfkaro-shared-image.pdf'): string {
  const path = join(tmpdir(), name);
  if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
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

// ---------------------------------------------------------------------------

test.describe('choosing a file and seeing its pages', () => {
  test('shows the file line, the pages, the line about cuts, and no toggle on the last page', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(fileLine(page)).toContainText('text.pdf, 3 pages');
    await expect(page.getByRole('button', { name: 'Remove text.pdf' })).toBeVisible();
    await expect(cells(page)).toHaveCount(3);
    await expect(cutLine(page)).toHaveText('No cuts marked. You will get one file per page, 3 files.');
    await expect(cut(page, 1)).toHaveAttribute('aria-pressed', 'false');
    await expect(cut(page, 2)).toBeVisible();
    await expect(cut(page, 3)).toHaveCount(0);
    await expect(status(page)).toContainText('text.pdf, 3 pages');
    await noSidewaysScroll(page);
  });

  test('the skip link takes a keyboard user past the pages to the main button', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(cells(page)).toHaveCount(3);
    await page.getByRole('link', { name: 'Skip to the main button' }).focus();
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused();
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

  test('a pasted file takes the place of the listed one, and the cuts are forgotten', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await cut(page, 1).click();
    await paste(page, 'mixed.pdf');
    await expect(fileLine(page)).toContainText('mixed.pdf, 4 pages');
    await expect(cells(page)).toHaveCount(4);
    await expect(cutLine(page)).toHaveText('No cuts marked. You will get one file per page, 4 files.');
  });

  test('Remove forgets the file and its pages and returns to the picker', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(page.locator('astro-island ol img')).toHaveCount(3, { timeout: 20000 });
    await page.getByRole('button', { name: 'Remove text.pdf' }).click();
    await expect(page.getByText('Choose a PDF file')).toBeVisible();
    await expect(cells(page)).toHaveCount(0);
    // A fresh pick works, so nothing of the kept document stood in its way.
    await pick(page, 'mixed.pdf');
    await expect(cells(page)).toHaveCount(4);
  });
});

test.describe('marking cuts and splitting', () => {
  test('marks and clears cuts by mouse and by keyboard, then splits into the right files', async ({ page }) => {
    await open(page);
    await pick(page, 'pages-500.pdf');
    await expect(cut(page, 3)).toBeVisible({ timeout: 20000 });

    await cut(page, 3).click();
    await expect(cut(page, 3)).toHaveAttribute('aria-pressed', 'true');
    await expect(cutLine(page)).toHaveText('Cut after page 3. You will get 2 files.');

    // By keyboard: Tab from page 3's toggle reaches page 4's; Space presses it, and focus stays.
    await cut(page, 3).focus();
    await page.keyboard.press('Tab');
    await expect(cut(page, 4)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(cut(page, 4)).toHaveAttribute('aria-pressed', 'true');
    await expect(cut(page, 4)).toBeFocused();
    await expect(status(page)).toHaveText('Cuts after pages 3 and 4. You will get 3 files.');

    // Clearing a cut says so, then the whole line.
    await page.keyboard.press('Space');
    await expect(status(page)).toHaveText('Cut after page 4 cleared. Cut after page 3. You will get 2 files.');
    await cut(page, 10).click();
    await cut(page, 9).click();
    await expect(cutLine(page)).toHaveText('Cuts after pages 3, 9 and 10. You will get 4 files.');
    await noSidewaysScroll(page);

    const download = await splitAndDownload(page);
    expect(download.suggestedFilename()).toBe('pages-500-split.zip');
    await expect(page.getByText('4 files,')).toBeVisible();
    const entries = await unzip(download);
    expect(Object.keys(entries)).toEqual(['pages-500-part-1.pdf', 'pages-500-part-2.pdf', 'pages-500-part-3.pdf', 'pages-500-part-4.pdf']);
    expect(await Promise.all(Object.values(entries).map(pagesIn))).toEqual([3, 6, 1, 490]);
  });

  test('no cuts on text.pdf gives one file per page', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(cells(page)).toHaveCount(3);
    const entries = await unzip(await splitAndDownload(page));
    expect(Object.keys(entries)).toEqual(['text-part-1.pdf', 'text-part-2.pdf', 'text-part-3.pdf']);
    expect(await Promise.all(Object.values(entries).map(pagesIn))).toEqual([1, 1, 1]);
  });

  test('a one-page file comes back as one PDF, with its page count', async ({ page }) => {
    await open(page);
    await pick(page, 'form.pdf');
    await expect(cutLine(page)).toHaveText('This file has one page. You will get it back as one file.');
    const download = await splitAndDownload(page);
    expect(download.suggestedFilename()).toBe('form-split.pdf');
    await expect(page.getByText(/, 1 page$/)).toBeVisible();
  });

  test('Cancel stops the work and keeps the cuts', async ({ page }) => {
    await open(page);
    await pick(page, 'pages-500.pdf');
    await expect(cut(page, 10)).toBeVisible({ timeout: 20000 });
    for (let n = 10; n <= 400; n += 10) await cut(page, n).click();
    await mainButton(page).click();
    await expect(page.locator('p[class*=progressLine]')).toHaveText(/^File \d+ of 41$/, { timeout: 30000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeVisible();
    await expect(cutLine(page)).toHaveText('40 cuts marked. You will get 41 files.');
  });

  test('when the zip step cannot be fetched, the page says so, and going back keeps the cuts', async ({ page, context }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await cut(page, 1).click();
    // The engine came with reading the file; the zip step is fetched at the start of every run.
    await context.route(/\/_astro\/fflate-/, (route) => route.abort());
    await mainButton(page).click();
    await expect(page.getByRole('heading', { name: 'The split did not finish.' })).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
    await context.unroute(/\/_astro\/fflate-/);
    await page.getByRole('button', { name: 'Go back to your files' }).click();
    await expect(cutLine(page)).toHaveText('Cut after page 1. You will get 2 files.');
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password, shows no pages until it opens, and its pages follow', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused();
    await expect(cells(page)).toHaveCount(0);
    await field.fill('wrong');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await expect(field).toBeFocused();
    await field.fill(password);
    await page.keyboard.press('Enter');
    await expect(cells(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Choose another file' })).toHaveCount(0);
  });

  test('a protected file can be put aside to choose another', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.getByText('Choose a PDF file')).toBeVisible();
  });

  test('a damaged file says so, shows no pages, and offers to choose another', async ({ page }) => {
    await open(page);
    await pick(page, 'damaged-cut.pdf');
    await expect(page.getByRole('heading', { name: 'damaged-cut.pdf is damaged and cannot be read.' })).toBeVisible();
    await expect(cells(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.getByText('Choose a PDF file')).toBeVisible();
  });

  test('a file over 100 MB is warned about, and can still be split @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('long files', () => {
  test('pages-500.pdf shows all 500 pages, with no button to show more', async ({ page }) => {
    await open(page);
    await pick(page, 'pages-500.pdf');
    await expect(cells(page)).toHaveCount(500, { timeout: 30000 });
    await expect(page.getByRole('button', { name: /^Show pages/ })).toHaveCount(0);
    // Whether it blocks the page is measured in performance.spec.ts, with nothing else running.
  });

  test('120,000 pages show 500 at a time; more come in real units, focus moves to the first new page @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    await picker(page).setInputFiles(generated('pdfkaro-many-pages.pdf'));
    await expect(cells(page)).toHaveCount(500, { timeout: 120000 });
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible();
    await watchLongTasks(page);
    const more = page.getByRole('button', { name: 'Show pages 501 to 1,000' });
    await more.click();
    await expect(cells(page)).toHaveCount(1000);
    await expect(cut(page, 501)).toBeFocused();
    await expect(status(page)).toHaveText('Showing 1,000 of 120,000 pages');
    await expect(page.getByRole('button', { name: 'Show pages 1,001 to 1,500' })).toBeVisible();
    expect(await longTasks(page)).toEqual([]);

    // No cuts would make more files than one zip can hold: the page says so at once.
    await mainButton(page).click();
    await expect(
      page.getByText('This would make more than 65,535 files, more than one zip can hold. Mark cuts so the file is split into fewer parts.'),
    ).toBeVisible({ timeout: 120000 });
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Split PDF's own files that may load after a pick, by exact name, read from the build. */
const filesAfterPick = () =>
  builtFiles(
    /^(ToolWorkspace\.[A-Za-z0-9_-]{8}\.js|FilePicker\.[A-Za-z0-9_-]{8}\.css|tool\.worker-[A-Za-z0-9_-]{8}\.js|split-pdf-[A-Za-z0-9_-]{8}\.js|plain-[A-Za-z0-9_-]{8}\.js|inspect-[A-Za-z0-9_-]{8}\.js|qpdf-[A-Za-z0-9_-]{8}\.(js|wasm)|thumbnail-[A-Za-z0-9_-]{8}\.js|pdf-[A-Za-z0-9_-]{8}\.js|pdf\.worker\.min-[A-Za-z0-9_-]{8}\.mjs|pdfjs-data-[A-Za-z0-9_-]{8}\.js|fflate-[A-Za-z0-9_-]{8}\.js)$/,
  );
const fflatePath = () => filesAfterPick().find((path) => /\/fflate-/.test(path))!;
const paths = (seen: Seen[]) => new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname));

test.describe('nothing is uploaded', () => {
  test('picks a protected file under a telling name, marks a cut, splits and downloads, with only the listed files fetched', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);

    await pick(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) });
    await page.getByLabel('Password for qz7report.pdf').fill(password);
    await page.keyboard.press('Enter');
    await cut(page, 1).click();
    await expect(page.locator('astro-island ol img')).toHaveCount(3, { timeout: 20000 });
    const entries = await unzip(await splitAndDownload(page));
    expect(Object.keys(entries)).toEqual(['qz7report-part-1.pdf', 'qz7report-part-2.pdf']);

    const secrets = ['qz7report.pdf', 'qz7report', password];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    expect(paths(seen).has(fflatePath())).toBe(true);
    expect([...paths(seen)].some((path) => /\/split-pdf-/.test(path))).toBe(true);

    const held = await traces(page, context);
    expect(held).toMatchObject({ local: 0, session: 0, databases: 0, caches: 0, opfs: [], cookies: [] });
    for (const secret of secrets) {
      expect(held.title).not.toContain(secret);
      expect(decodeURIComponent(held.address)).not.toContain(secret);
      for (const line of consoleText) expect(line).not.toContain(secret);
    }
  });

  test('a one-part run and a several-part run each fetch the zip step, and the same files', async ({ browser, baseURL }) => {
    const run = async (name: string, pictures: number) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await open(page);
      await pick(page, name);
      await expect(page.locator('astro-island ol img')).toHaveCount(pictures, { timeout: 20000 });
      const seen = watch(context, page);
      await splitAndDownload(page);
      expect(violations(seen, new URL(baseURL!).origin, [name], filesAfterPick())).toEqual([]);
      const fetched = paths(seen);
      await context.close();
      return fetched;
    };
    const one = await run('form.pdf', 1);
    const several = await run('text.pdf', 3);
    expect(one.has(fflatePath())).toBe(true);
    expect(several.has(fflatePath())).toBe(true);
    expect([...one].sort()).toEqual([...several].sort());
  });

  test('the watcher catches a query string or a body on the zip step\'s own address, for what it is', async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    await open(page);
    const path = fflatePath();

    const queried = watch(context, page);
    await page.evaluate((address) => fetch(`${address}?x=1`).catch(() => {}), path);
    await expect.poll(() => queried.some((request) => request.url.includes('?x=1'))).toBe(true);
    const query = queried.filter((request) => request.url.includes('?x=1'));
    expect(violations(query, origin, [], filesAfterPick())).toEqual([`data in the address: ${origin}${path}?x=1`]);

    const posted = watch(context, page);
    await page.evaluate((address) => fetch(address, { method: 'POST', body: 'x' }).catch(() => {}), path);
    await expect.poll(() => posted.some((request) => request.method === 'POST')).toBe(true);
    const post = posted.filter((request) => request.method === 'POST');
    expect(violations(post, origin, [], filesAfterPick())).toEqual([`POST ${origin}${path}`, `a body: ${origin}${path}`]);
  });

  test('no bookmark title reaches a request or the console', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pick(page, 'rich.pdf');
    await expect(cells(page)).toHaveCount(2);
    await splitAndDownload(page);
    expect(violations(seen, new URL(baseURL!).origin, ['Chapter one', 'Chapter two', 'note.txt'], filesAfterPick())).toEqual([]);
    for (const line of consoleText) expect(line).not.toMatch(/Chapter (one|two)/);
  });
});
