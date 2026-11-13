// Delete pages in a real browser, at a phone width and a desktop width, with
// the real engine: marking pages by mouse and keyboard, every state, and the
// promise that nothing about a file leaves the device.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
const mainButton = (page: Page) => page.getByRole('button', { name: 'Delete and download' });
const fileLine = (page: Page) => page.locator('p[tabindex="-1"]');
const markedLine = (page: Page) => page.locator('p[class*=toggleSummary]');
const cells = (page: Page) => page.locator('astro-island ol > li');
const mark = (page: Page, n: number) => page.getByRole('button', { name: `Delete page ${n}`, exact: true });
const status = (page: Page) => page.locator('[role=status]').first();
const noneSentence = 'Mark at least one page to delete.';
const allSentence = 'A PDF needs at least one page. Leave one or more pages unmarked.';
const blockedSentence = (page: Page, text = noneSentence) => page.locator('p:not([role=status])', { hasText: text });

async function open(page: Page) {
  await page.goto('/delete-pdf-pages');
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

async function deleteAndDownload(page: Page): Promise<Download> {
  await mainButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your new file is ready' })).toBeFocused({ timeout: 60000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  return download;
}

const pagesOf = async (download: Download) => (await PDFDocument.load(readFileSync((await download.path())!))).getPageCount();

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

test.describe('marking pages and deleting', () => {
  test('shows the pages with a Delete button on each, and holds the main button until a page is marked', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(fileLine(page)).toContainText('text.pdf, 3 pages');
    await expect(cells(page)).toHaveCount(3);
    await expect(mark(page, 3)).toBeVisible();
    await expect(markedLine(page)).toHaveText('No pages marked. Press “Delete” under each page you want to delete.');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(blockedSentence(page)).toBeVisible();
    const describedBy = await mainButton(page).getAttribute('aria-describedby');
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(noneSentence);
  });

  test('marks pages by mouse and keyboard, draws no cut line, and gives the pages left in order', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await mark(page, 3).click();
    await expect(mark(page, 3)).toHaveAttribute('aria-pressed', 'true');
    await expect(markedLine(page)).toHaveText('Page 3 will be deleted. 2 pages will be left.');
    await expect(blockedSentence(page)).toHaveCount(0);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('astro-island ol > li[class*=cut]')).toHaveCount(0);

    await mark(page, 1).focus();
    await page.keyboard.press('Space');
    await expect(mark(page, 1)).toBeFocused();
    await expect(status(page)).toHaveText('Page 1 marked to delete, 2 in all.');
    await expect(markedLine(page)).toHaveText('Pages 1 and 3 will be deleted. 1 page will be left.');

    const download = await deleteAndDownload(page);
    expect(download.suggestedFilename()).toBe('text-pages-deleted.pdf');
    await expect(page.getByText(/1 page\b/)).toBeVisible();
    expect(await pagesOf(download)).toBe(1);
  });

  test('the pages left are the ones not marked: mixed.pdf without pages 1 and 4 keeps its Letter and A5 pages', async ({ page }) => {
    await open(page);
    await pick(page, 'mixed.pdf');
    await mark(page, 1).click();
    await mark(page, 4).click();
    const download = await deleteAndDownload(page);
    const doc = await PDFDocument.load(readFileSync((await download.path())!));
    expect(doc.getPages().map((each) => [each.getWidth(), each.getHeight(), each.getRotation().angle])).toEqual([
      [792, 612, 0],
      [420, 595, 90],
    ]);
  });

  test('marking every page says so and holds the button back; clearing the last mark holds it back too', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await mark(page, 1).click();
    await mark(page, 2).click();
    await mark(page, 3).click();
    await expect(status(page)).toHaveText('Page 3 marked to delete. Every page is marked, so no pages will be left.');
    await expect(markedLine(page)).toHaveText('Pages 1, 2 and 3 will be deleted. No pages will be left.');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(blockedSentence(page, allSentence)).toBeVisible();

    await mark(page, 3).click();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await mark(page, 2).click();
    await mark(page, 1).click();
    await expect(status(page)).toHaveText('Page 1 no longer marked. No pages marked.');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('the skip link takes a keyboard user past the pages', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(cells(page)).toHaveCount(3);
    await page.getByRole('link', { name: 'Skip to the main button' }).focus();
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused();
  });

  test('Cancel keeps the pages marked', async ({ page }) => {
    await open(page);
    await pick(page, 'pages-500.pdf');
    await expect(mark(page, 100)).toBeVisible({ timeout: 30000 });
    await mark(page, 100).click();
    // Hold the job: each qpdf instance fetches its WebAssembly, so a fetch that never answers keeps the job running.
    await page.context().route(/\/_astro\/qpdf-[^/]+\.wasm$/, () => {});
    await mainButton(page).click();
    await expect(page.locator('p[class*=progressLine]')).toHaveText('Starting on 1 file');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeVisible();
    await expect(markedLine(page)).toHaveText('Page 100 will be deleted. 499 pages will be left.');
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password, then shows its pages', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused();
    await expect(cells(page)).toHaveCount(0);
    await expect(blockedSentence(page)).toHaveCount(0);
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
    await context.route(/\/_astro\/delete-pdf-pages-/, (route) => route.abort());
    await open(page);
    await pick(page, 'text.pdf');
    await expect(page.getByRole('heading', { name: 'The new file was not made.' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });
});

test.describe('very many pages', () => {
  test('a file of 120,000 pages shows the notice, and marking a page blocks nothing for more than 100 ms @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(mark(page, 1)).toBeVisible();
    await watchLongTasks(page);
    await mark(page, 1).click();
    await mark(page, 7).click();
    await expect(markedLine(page)).toHaveText('Pages 1 and 7 will be deleted. 119,998 pages will be left.');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await longTasks(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Delete pages' own files that may load after a pick, by exact name, read from the build. */
const filesAfterPick = () =>
  builtFiles(
    /^(ToolWorkspace\.[A-Za-z0-9_-]{8}\.js|FilePicker\.[A-Za-z0-9_-]{8}\.css|tool\.worker-[A-Za-z0-9_-]{8}\.js|delete-pdf-pages-[A-Za-z0-9_-]{8}\.js|plain-[A-Za-z0-9_-]{8}\.js|inspect-[A-Za-z0-9_-]{8}\.js|qpdf-[A-Za-z0-9_-]{8}\.(js|wasm)|thumbnail-[A-Za-z0-9_-]{8}\.js|pdf-[A-Za-z0-9_-]{8}\.js|pdf\.worker\.min-[A-Za-z0-9_-]{8}\.mjs|pdfjs-data-[A-Za-z0-9_-]{8}\.js)$/,
  );
const paths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];

test.describe('nothing is uploaded', () => {
  test('picks a protected file under a telling name, marks a page, deletes and downloads, with only the listed files fetched', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pick(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) });
    await page.getByLabel('Password for qz7report.pdf').fill(password);
    await page.keyboard.press('Enter');
    await mark(page, 2).click();
    await expect(page.locator('astro-island ol img')).toHaveCount(3, { timeout: 20000 });
    const download = await deleteAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7report-pages-deleted.pdf');

    const secrets = ['qz7report.pdf', 'qz7report', password];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = paths(seen);
    expect(fetched.some((path) => /\/delete-pdf-pages-/.test(path))).toBe(true);
    for (const other of [/\/fflate-/, /\/split-pdf-/, /\/merge-pdf-/, /\/extract-pdf-pages-/]) expect(fetched.some((path) => other.test(path))).toBe(false);

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
    await mark(page, 1).click();
    await deleteAndDownload(page);
    expect(violations(seen, new URL(baseURL!).origin, ['Chapter one', 'Chapter two', 'note.txt'], filesAfterPick())).toEqual([]);
    for (const line of consoleText) expect(line).not.toMatch(/Chapter (one|two)|note\.txt/);
  });

  test('the tag text, link names and thread title of a deleted page reach no request and no console line', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pick(page, 'tagged.pdf');
    await mark(page, 2).click();
    await deleteAndDownload(page);
    const secrets = ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT'];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    for (const line of consoleText) for (const secret of secrets) expect(line).not.toContain(secret);
  });
});
