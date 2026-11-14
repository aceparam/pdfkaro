// Rotate PDF in a real browser, at a phone width and a desktop width, with the
// real engine: turning pages by keyboard and button, every state, and the
// promise that nothing about a file, or the turns made, leaves the device.

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
const mainButton = (page: Page) => page.getByRole('button', { name: 'Turn and download' });
const fileLine = (page: Page) => page.locator('p[tabindex="-1"]');
const turnLine = (page: Page) => page.locator('p[class*=toggleSummary]');
const cells = (page: Page) => page.locator('astro-island ol > li');
const left = (page: Page, n: number) => page.getByRole('button', { name: `Turn page ${n} left`, exact: true });
const right = (page: Page, n: number) => page.getByRole('button', { name: `Turn page ${n} right`, exact: true });
const everyRight = (page: Page) => page.getByRole('button', { name: 'Turn every page right' });
const captions = (page: Page) => page.locator('astro-island ol > li > div:nth-child(2)').allTextContents();
const status = (page: Page) => page.locator('[role=status]').first();
const how = 'Press “Turn left” or “Turn right” under a page to turn it, or turn every page at once.';
const blockedSentence = 'Turn a page to make a new file.';

async function open(page: Page) {
  await page.goto('/rotate-pdf');
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

async function turnAndDownload(page: Page): Promise<Download> {
  await mainButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your new file is ready' })).toBeFocused({ timeout: 60000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  return download;
}

const turnsOf = async (download: Download) =>
  (await PDFDocument.load(readFileSync((await download.path())!))).getPages().map((each) => ((each.getRotation().angle % 360) + 360) % 360);

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

test.describe('turning pages', () => {
  test('shows the pages as they are, with Turn left and Turn right on each, and holds the main button until a page is turned', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(fileLine(page)).toContainText('text.pdf, 3 pages');
    await expect(cells(page)).toHaveCount(3);
    await expect(turnLine(page)).toHaveText(`No pages will be turned. ${how}`);
    await expect(right(page, 3)).toBeVisible();
    await expect(everyRight(page)).toBeVisible();
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    const describedBy = await mainButton(page).getAttribute('aria-describedby');
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(blockedSentence);
    await expect(page.getByRole('button', { name: /^Remove page/ })).toHaveCount(0);
  });

  test('turns a page by keyboard, says so in the caption and the status region, and keeps focus', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await right(page, 2).focus();
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Page 2 is now turned right.');
    await expect(right(page, 2)).toBeFocused();
    expect(await captions(page)).toEqual(['Page 1', 'Page 2, turned right', 'Page 3']);
    await expect(turnLine(page)).toHaveText(`1 page will be turned. ${how}`);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Page 2 is now turned half round.');
    // Back the way it was: the main button waits again.
    await left(page, 2).click();
    await left(page, 2).click();
    await expect(status(page)).toHaveText('Page 2 is back the way it was.');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('turns pages and gives a file with those turns, adding to the turn a page already had', async ({ page }) => {
    await open(page);
    // mixed.pdf: A4 upright, Letter on its side, A5 a quarter turned, A4 upside down.
    await pick(page, 'mixed.pdf');
    await right(page, 1).click();
    await right(page, 4).click();
    await right(page, 4).click();
    const download = await turnAndDownload(page);
    expect(download.suggestedFilename()).toBe('mixed-rotated.pdf');
    await expect(page.getByText(/4 pages/)).toBeVisible();
    expect(await turnsOf(download)).toEqual([90, 0, 90, 0]);
  });

  test('turns every page, and says where they are; a second press says where they are now', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await everyRight(page).click();
    await expect(status(page)).toHaveText('Every page is now turned right.');
    expect(await captions(page)).toEqual(['Page 1, turned right', 'Page 2, turned right', 'Page 3, turned right']);
    await expect(turnLine(page)).toHaveText(`Every page will be turned. ${how}`);
    await everyRight(page).click();
    await expect(status(page)).toHaveText('Every page is now turned half round.');
  });

  test('turning every page reaches pages not shown yet', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await picker(page).setInputFiles(await plainPages(900));
    await expect(right(page, 500)).toBeVisible({ timeout: 60000 });
    await everyRight(page).click();
    await page.getByRole('button', { name: 'Show pages 501 to 900' }).click();
    await expect(page.locator('astro-island ol > li', { hasText: 'Page 900, turned right' })).toHaveCount(1);
  });

  test('a one-page file shows only its own buttons', async ({ page }) => {
    await open(page);
    await pick(page, 'form.pdf');
    await expect(right(page, 1)).toBeVisible();
    await expect(everyRight(page)).toHaveCount(0);
    await expect(turnLine(page)).toHaveText('No pages will be turned. Press “Turn left” or “Turn right” under it to turn it.');
  });

  test('the skip link takes a keyboard user past the pages', async ({ page }) => {
    await open(page);
    await pick(page, 'text.pdf');
    await expect(cells(page)).toHaveCount(3);
    await page.getByRole('link', { name: 'Skip to the main button' }).focus();
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused();
  });

  test('Cancel keeps the turns', async ({ page }) => {
    await open(page);
    await pick(page, 'pages-500.pdf');
    await expect(right(page, 2)).toBeVisible({ timeout: 30000 });
    await right(page, 2).click();
    await page.context().route(/\/_astro\/qpdf-[^/]+\.wasm$/, () => {});
    await mainButton(page).click();
    await expect(page.locator('p[class*=progressLine]')).toHaveText('Starting on 1 file');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeVisible();
    expect((await captions(page)).slice(0, 2)).toEqual(['Page 1', 'Page 2, turned right']);
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password, then shows its pages', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused();
    await expect(cells(page)).toHaveCount(0);
    await expect(turnLine(page)).toHaveCount(0);
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
    await context.route(/\/_astro\/rotate-pdf-/, (route) => route.abort());
    await open(page);
    await pick(page, 'text.pdf');
    await expect(page.getByRole('heading', { name: 'The new file was not made.' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });
});

test.describe('very many pages', () => {
  test('a file of 120,000 pages shows the notice, and turning every page or one page blocks nothing for more than 100 ms @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(right(page, 1)).toBeVisible();
    await watchLongTasks(page);
    await everyRight(page).click();
    await expect(status(page)).toHaveText('Every page is now turned right.');
    await right(page, 1).click();
    await expect(status(page)).toHaveText('Page 1 is now turned half round.');
    await expect(turnLine(page)).toHaveText(`Every page will be turned. ${how}`);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await longTasks(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Rotate PDF's own files that may load after a pick, by exact name, read from the build. */
const filesAfterPick = () =>
  builtFiles(
    /^(ToolWorkspace\.[A-Za-z0-9_-]{8}\.js|FilePicker\.[A-Za-z0-9_-]{8}\.css|tool\.worker-[A-Za-z0-9_-]{8}\.js|rotate-pdf-[A-Za-z0-9_-]{8}\.js|plain-[A-Za-z0-9_-]{8}\.js|inspect-[A-Za-z0-9_-]{8}\.js|qpdf-[A-Za-z0-9_-]{8}\.(js|wasm)|thumbnail-[A-Za-z0-9_-]{8}\.js|pdf-[A-Za-z0-9_-]{8}\.js|pdf\.worker\.min-[A-Za-z0-9_-]{8}\.mjs|pdfjs-data-[A-Za-z0-9_-]{8}\.js)$/,
  );
const paths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];

test.describe('nothing is uploaded', () => {
  test('picks a protected file under a telling name, turns a page, writes and downloads, with only the listed files fetched', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pick(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) });
    await page.getByLabel('Password for qz7report.pdf').fill(password);
    await page.keyboard.press('Enter');
    await right(page, 2).click();
    await expect(page.locator('astro-island ol img')).toHaveCount(3, { timeout: 20000 });
    const download = await turnAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7report-rotated.pdf');

    const secrets = ['qz7report.pdf', 'qz7report', password];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = paths(seen);
    expect(fetched.some((path) => /\/rotate-pdf-/.test(path))).toBe(true);
    for (const other of [/\/fflate-/, /\/split-pdf-/, /\/merge-pdf-/, /\/extract-pdf-pages-/, /\/delete-pdf-pages-/, /\/rearrange-pdf-pages-/]) expect(fetched.some((path) => other.test(path))).toBe(false);

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
    await right(page, 1).click();
    await turnAndDownload(page);
    expect(violations(seen, new URL(baseURL!).origin, ['Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment'], filesAfterPick())).toEqual([]);
    for (const line of consoleText) expect(line).not.toMatch(/Chapter (one|two)|note\.txt|Bookmarks, a link and an attachment/);
    expect(await page.title()).not.toContain('Bookmarks, a link');
  });

  test('the hidden text of tagged.pdf reaches no request and no console line, and the address holds no turns', async ({ page, context, baseURL }) => {
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pick(page, 'tagged.pdf');
    await right(page, 2).click();
    await turnAndDownload(page);
    const secrets = ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-LINK', 'SECRET-NOTE'];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    for (const line of consoleText) for (const secret of secrets) expect(line).not.toContain(secret);
    const address = new URL(page.url());
    expect(address.search).toBe('');
    expect(address.hash).toBe('');
  });
});
