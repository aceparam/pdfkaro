// Compress PDF in a real browser, at a phone width and a desktop width, with
// the real engine: choosing a file, the result with its old size, the result
// with no new file, every state, the keyboard, and the promise that nothing
// about a file, its pictures or its password leaves the device.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Download, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createQpdf } from '../../src/engines/qpdf';
import { formatSize } from '../../src/widget/format';
import { headersRead, traces, violations, watch, type Seen } from './no-upload';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixture = (name: string) => join(here, '../fixtures', name);
const password = 'open-sesame';
const noSmaller = 'This file could not be made smaller.';
const noSmallerAdvice = 'It may already be compressed, or its pictures are of a kind this tool leaves alone. The questions below say more.';

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Compress and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const summary = (page: Page) => page.locator('astro-island p[tabindex="-1"]');
const status = (page: Page) => page.locator('[role=status]').first();
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your compressed file is ready' });
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page) {
  await page.goto('/compress-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

type Given = string | { name: string; mimeType: string; buffer: Buffer };
async function pick(page: Page, file: Given) {
  await picker(page).setInputFiles(typeof file === 'string' ? fixture(file) : file);
}
/** Picks a file and waits until it has been read. */
async function pickReady(page: Page, file: Given) {
  await pick(page, file);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).filter({ hasText: 'Getting ready' })).toHaveCount(0, { timeout: 30000 });
}

async function drop(page: Page, names: string[]) {
  const files = names.map((name) => ({ name, data: readFileSync(fixture(name)).toString('base64') }));
  await page.evaluate((given) => {
    const transfer = new DataTransfer();
    for (const { name, data } of given) transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: 'application/pdf' }));
    for (const type of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

async function compressAndDownload(page: Page): Promise<{ download: Download; bytes: Uint8Array }> {
  await mainButton(page).click();
  await expect(resultHeading(page)).toBeFocused({ timeout: 90000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  const done = await download;
  return { download: done, bytes: new Uint8Array(readFileSync((await done.path())!)) };
}

const qpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
async function qpdfOn(bytes: Uint8Array, args: string[]) {
  const tool = await qpdf();
  tool.write('/r.pdf', bytes);
  return tool.call([...args, '/r.pdf']);
}
type Picture = { dict: Record<string, unknown>; data: Buffer };
/** Every picture in a file, its dictionary and its data as stored. */
async function picturesOf(bytes: Uint8Array, given?: string): Promise<Picture[]> {
  const { out } = await qpdfOn(bytes, [...(given ? [`--password=${given}`] : []), '--json=2', '--json-key=qpdf', '--decode-level=none', '--json-stream-data=inline']);
  const objects = (JSON.parse(out) as { qpdf: [unknown, Record<string, { stream?: { dict: Record<string, unknown>; data?: string } }>] }).qpdf[1];
  return Object.values(objects).flatMap((entry) => (entry.stream && entry.stream.dict['/Subtype'] === '/Image' ? [{ dict: entry.stream.dict, data: Buffer.from(entry.stream.data ?? '', 'base64') }] : []));
}

/** Records every line above the bar and every value of the bar, from the first change after it is called. */
async function recordProgress(page: Page) {
  await page.evaluate(() => {
    const seen: { line: string; value: number }[] = [];
    (window as unknown as { progress: typeof seen }).progress = seen;
    const note = () => {
      const line = document.querySelector('p[class*=progressLine]')?.textContent ?? '';
      const bar = document.querySelector('[role=progressbar]');
      if (!line || !bar) return;
      const value = Number(bar.getAttribute('aria-valuenow'));
      const last = seen.at(-1);
      if (!last || last.line !== line || last.value !== value) seen.push({ line, value });
    };
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-valuenow'] });
  });
}
const recorded = (page: Page) => page.evaluate(() => (window as unknown as { progress: { line: string; value: number }[] }).progress);

// ---------------------------------------------------------------------------

test.describe('choosing a file', () => {
  test('lists one row with its first page, pages and size, and no summary line; focus goes to the main button', async ({ page }) => {
    await open(page);
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await pickReady(page, 'compress-scans.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('compress-scans.pdf');
    await expect(rows(page)).toContainText(`3 pages, ${formatSize(readFileSync(fixture('compress-scans.pdf')).length)}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(summary(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    await expect(mainButton(page)).toBeFocused();
    await expect(status(page)).toHaveText(`compress-scans.pdf, 3 pages, ${formatSize(readFileSync(fixture('compress-scans.pdf')).length)}.`);
    await expect(page.locator('label', { hasText: 'Choose another file' })).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('another file replaces the first', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await pickReady(page, 'mixed.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('mixed.pdf');
  });

  test('two files dropped at once: the first is listed, and the page says the tool takes one file', async ({ page }) => {
    await open(page);
    await drop(page, ['text.pdf', 'mixed.pdf']);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('text.pdf');
    await expect(page.locator('p:not([role=status])', { hasText: 'This tool takes one file, so mixed.pdf was not added.' })).toBeVisible();
  });

  test('a file that is not a PDF is refused by name', async ({ page }) => {
    await open(page);
    await pick(page, 'not-a-pdf.pdf');
    await expect(page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });
});

test.describe('compressing', () => {
  test('makes the scans smaller: the file name, its size beside the old size, its pages, and a file that passes qpdf --check', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'compress-scans.pdf');
    await recordProgress(page);
    const { download, bytes } = await compressAndDownload(page);
    const before = readFileSync(fixture('compress-scans.pdf')).length;
    expect(download.suggestedFilename()).toBe('compress-scans-compressed.pdf');
    expect(bytes.length).toBeLessThan(before / 2);
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, was ${formatSize(before)}, 3 pages`);
    for (const note of ['Pictures that were made smaller can look slightly less sharp up close.', 'If the file had a password or restrictions, it still has them.']) await expect(page.getByText(note)).toBeVisible();
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, ['--show-npages'])).out.trim()).toBe('3');
    const pictures = await picturesOf(bytes);
    expect(pictures.map(({ dict }) => [dict['/Width'], dict['/Height'], dict['/Filter'], dict['/ColorSpace']]).sort()).toEqual([
      [1240, 1754, '/DCTDecode', '/DeviceRGB'],
      [1240, 1754, '/DCTDecode', '/DeviceRGB'],
      [1240, 1754, '/FlateDecode', '/DeviceRGB'],
    ]);

    // "Reading the file", then each picture, then writing, with a bar that never goes back and is not full while writing.
    const progress = await recorded(page);
    // Before the first word from the worker the line says "Starting on 1 file", as for every tool.
    const lines = [...new Set(progress.map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    expect(lines).toEqual(['Reading the file', 'Picture 1 of 3', 'Picture 2 of 3', 'Picture 3 of 3', 'Writing the compressed file']);
    const values = progress.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const step of progress.filter((each) => each.line === 'Writing the compressed file')) expect(step.value).toBeLessThan(100);
    await noSidewaysScroll(page);
  });

  test('a file already packed: "could not be made smaller", its advice, Start again and no Download, with focus on the sentence', async ({ page }) => {
    await open(page);
    await pickReady(page, 'compress-packed.pdf');
    await mainButton(page).click();
    const heading = page.getByRole('heading', { name: noSmaller });
    await expect(heading).toBeFocused({ timeout: 30000 });
    await expect(heading).toHaveAccessibleDescription(noSmallerAdvice);
    await expect(page.getByText(noSmallerAdvice)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    await expect(page.getByText('Pictures that were made smaller can look slightly less sharp up close.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('a JPG that is already small is left as it was in Chromium, by the 10% rule, while the text around it is compressed', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The 10% rule is checked with Chromium’s JPG encoder');
    await open(page);
    await pickReady(page, 'compress-small-jpg.pdf');
    const { bytes } = await compressAndDownload(page);
    const [was] = await picturesOf(new Uint8Array(readFileSync(fixture('compress-small-jpg.pdf'))));
    const [now] = await picturesOf(bytes);
    expect(now!.dict['/Width']).toBe(600);
    expect(now!.data.equals(was!.data)).toBe(true);
  });

  test('done by keyboard alone: compress from the main button, then Download from the result', async ({ page }) => {
    await open(page);
    await pickReady(page, 'compress-text.pdf');
    await expect(mainButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
    // The sizes follow the heading, so a screen reader reads them next.
    await expect(page.locator('astro-island section')).toContainText(/\d+ KB, was 21 KB, 3 pages/);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Download' })).toBeFocused();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await download).suggestedFilename()).toBe('compress-text-compressed.pdf');
  });

  test('Cancel during the write of a 1 GB attachment stops the job and lists the file again', async ({ page }) => {
    await open(page);
    await pickReady(page, 'compress-bomb-attachment.pdf');
    await mainButton(page).click();
    await expect(page.locator('p[class*=progressLine]')).toHaveText('Writing the compressed file', { timeout: 30000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(rows(page)).toContainText('compress-bomb-attachment.pdf');
    await expect(page.getByRole('heading', { name: noSmaller })).toHaveCount(0);
    await expect(resultHeading(page)).toHaveCount(0);
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password; a wrong one says so; the right one opens it, and the result keeps the password', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused();
    await expect(page.getByText(/stays in (this|your) browser/).first()).toBeVisible();
    await expect(mainButton(page)).toHaveCount(0);
    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await expect(field).toBeFocused();
    await field.fill(password);
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused();
    const { bytes } = await compressAndDownload(page);
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(2);
    expect((await qpdfOn(bytes, [`--password=${password}`, '--check'])).code).toBe(0);
  });

  test('a damaged file says so and offers to choose another', async ({ page }) => {
    await open(page);
    await pick(page, 'damaged-xref.pdf');
    await expect(page.getByRole('heading', { name: 'damaged-xref.pdf is damaged and cannot be read.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
  });

  test('when the engine cannot be fetched, the page says so', async ({ page, context }) => {
    await context.route(/\/_astro\/compress-pdf-/, (route) => route.abort());
    await open(page);
    await pick(page, 'text.pdf');
    await expect(page.getByRole('heading', { name: 'The compression did not finish.' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });

  test('when the browser runs out of memory, the page says so and what to try, and the file stays listed', async ({ page, context }) => {
    // An engine that reads the file as the real one does, then runs out of memory as a phone might.
    await context.route(/\/_astro\/compress-pdf-[A-Za-z0-9_-]{8}\.js$/, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: "export const loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }; export const inspect = async () => ({ kind: 'ready', pages: 3 }); export const run = async () => { throw new RangeError('Array buffer allocation failed'); };",
      }),
    );
    await open(page);
    await pickReady(page, 'text.pdf');
    await mainButton(page).click();
    await expect(page.getByRole('heading', { name: 'The compression did not finish.' })).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('Your browser ran out of memory. Try on a computer, or split the file first and compress the parts.')).toBeVisible();
    await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
    await expect(rows(page)).toContainText('text.pdf');
    await expect(mainButton(page)).toBeFocused();
  });

  test('a file over 100 MB shows the notice, and the main button works @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Compress PDF's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts). No pdf-lib. */
const filesAfterPick = () => toolFiles('compress-pdf').all;
const fetchedPaths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];
const built = (path: string) => readFileSync(join(here, '../../dist', path), 'utf8');
/** The built file, among those fetched, that holds a sentence from a source file, so code the bundler moved into another chunk is still found. */
const holding = (fetched: string[], sentence: string) => fetched.filter((path) => /\.m?js$/.test(path) && built(path).includes(sentence));

async function watchedRun(page: Page, given: Given, typed?: string) {
  const consoleText: string[] = [];
  page.on('console', (message) => consoleText.push(message.text()));
  await pick(page, given);
  if (typed) {
    await page.getByLabel(/^Password for /).fill(typed);
    await page.keyboard.press('Enter');
  }
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
  return consoleText;
}

async function expectNothingHeld(page: Page, context: import('@playwright/test').BrowserContext, secrets: string[], consoleText: string[]) {
  const held = await traces(page, context);
  expect(held).toMatchObject({ local: 0, session: 0, databases: 0, caches: 0, opfs: [], cookies: [] });
  const address = new URL(held.address);
  expect(address.search).toBe('');
  expect(address.hash).toBe('');
  for (const secret of secrets) {
    expect(held.title).not.toContain(secret);
    expect(decodeURIComponent(held.address)).not.toContain(secret);
    for (const line of consoleText) expect(line).not.toContain(secret);
  }
}

test.describe('nothing is uploaded', () => {
  test('the scans under a telling name: a JPG with camera and place markers and a lossless picture are made smaller and downloaded, with only the listed files fetched', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    await open(page);
    const seen = watch(context, page);
    const consoleText = await watchedRun(page, { name: 'qz7scans.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('compress-scans.pdf')) });
    const { download, bytes } = await compressAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7scans-compressed.pdf');
    const pictures = await picturesOf(bytes);
    expect(pictures.map(({ dict }) => `${dict['/Width']}x${dict['/Height']} ${dict['/Filter']}`).sort()).toEqual(['1240x1754 /DCTDecode', '1240x1754 /DCTDecode', '1240x1754 /FlateDecode']);

    const secrets = ['qz7scans.pdf', 'qz7scans', 'SECRET-CAMERA-MAKE', 'SECRET-CAMERA-MODEL', 'SECRET-GPS-PLACE', 'Three scans to compress'];
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = fetchedPaths(seen);
    // The engine, fflate and the picture reader were fetched; resampling and the qpdf JSON steps ran from what was fetched.
    for (const name of [/\/compress-pdf-/, /\/fflate-/, /\/picture-[A-Za-z0-9_-]{8}\.js$/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    expect(holding(fetched, 'The samples are not the size given.').length).toBe(1);
    expect(holding(fetched, 'An object id was not valid.').length).toBe(1);
    for (const other of [/\/compress-to-target-/, /\/pdflib-/, /\/picture-thumbnail-/, /\/split-pdf-/, /\/merge-pdf-/, /\/rotate-pdf-/, /\/images-to-pdf-/]) expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    await expectNothingHeld(page, context, secrets, consoleText);
  });

  test('a protected file under a telling name, with its password, compressed and downloaded', async ({ page, context, baseURL }) => {
    await open(page);
    const seen = watch(context, page);
    const consoleText = await watchedRun(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) }, password);
    await compressAndDownload(page);
    const secrets = ['qz7report.pdf', 'qz7report', password];
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, consoleText);
  });

  test('rich.pdf under a telling name: no bookmark title, attachment name or document title leaves; both sizes are said in bytes', async ({ page, context, baseURL }) => {
    await open(page);
    const seen = watch(context, page);
    const consoleText = await watchedRun(page, { name: 'qz7rich.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('rich.pdf')) });
    const { download } = await compressAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7rich-compressed.pdf');
    // 2,064 bytes and its result both read "2 KB", so both are said one unit finer.
    await expect(page.locator('astro-island section')).toContainText(/\d,\d{3} bytes, was 2,064 bytes, 2 pages/);
    const secrets = ['qz7rich.pdf', 'qz7rich', 'Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment'];
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, consoleText);
  });

  test('tagged.pdf and form.pdf downloaded, then a packed file that could not be made smaller: no hidden text, title or field value leaves', async ({ page, context, baseURL }) => {
    const secrets = [
      'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE',
      'A tagged file', 'A fillable form', 'Sample text', 'An ordinary text document',
    ];
    await open(page);
    const seen = watch(context, page);
    const consoleText = await watchedRun(page, 'tagged.pdf');
    await compressAndDownload(page);
    await page.getByRole('button', { name: 'Start again' }).click();
    consoleText.push(...(await watchedRun(page, 'form.pdf')));
    await compressAndDownload(page);
    await page.getByRole('button', { name: 'Start again' }).click();
    consoleText.push(...(await watchedRun(page, 'compress-packed.pdf')));
    await mainButton(page).click();
    await expect(page.getByRole('heading', { name: noSmaller })).toBeFocused({ timeout: 30000 });
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('astro-island')).not.toContainText('compress-packed.pdf');
    await expectNothingHeld(page, context, secrets, consoleText);
  });
});
