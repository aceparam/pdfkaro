// Add page numbers in a real browser, at a phone width and a desktop width,
// with the real engine: choosing a file, the place by keyboard, numbering a
// file at a place that is not the starting one and checking the download,
// every state, and the promise that nothing about a file, its password or the
// place chosen leaves the device.

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
import { lastTextPlaces, texts } from '../unit/stamp-helpers';
import { headersRead, traces, violations, watch, type Seen } from './no-upload';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixture = (name: string) => join(here, '../fixtures', name);
const password = 'open-sesame';
const places = ['Bottom left', 'Bottom centre', 'Bottom right', 'Top left', 'Top centre', 'Top right'];
const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Add numbers and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const summary = (page: Page) => page.locator('astro-island p[tabindex="-1"]');
const status = (page: Page) => page.locator('[role=status]').first();
const group = (page: Page) => page.getByRole('group', { name: 'Where the numbers go' });
const place = (page: Page, name: string) => group(page).getByRole('radio', { name, exact: true });
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your numbered file is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The numbers were not added.' });
const anotherFile = (page: Page) => page.getByLabel('Choose another file');
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page) {
  await page.goto('/add-page-numbers-to-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

type Given = string | { name: string; mimeType: string; buffer: Buffer };
async function pick(page: Page, file: Given) {
  await picker(page).setInputFiles(typeof file === 'string' ? fixture(file) : file);
}
const nameOf = (file: Given) => (typeof file === 'string' ? file : file.name);

/**
 * Waits until this file is listed and read: its row is there, and the option group, which shows only once
 * every listed file has been read, is on screen. Checking only that no row says "Getting ready" would pass
 * at once, before the row of a new file is even listed (the page first reads the file's opening bytes),
 * and leave the read itself to a short wait.
 */
async function waitUntilRead(page: Page, file: Given) {
  await expect(rows(page).filter({ hasText: nameOf(file) })).toHaveCount(1, { timeout: 30000 });
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
  await expect(group(page)).toBeVisible({ timeout: 30000 });
}

/** Picks a file and waits until it has been read. */
async function pickReady(page: Page, file: Given) {
  await pick(page, file);
  await expect(rows(page)).toHaveCount(1);
  await waitUntilRead(page, file);
}

async function drop(page: Page, names: string[]) {
  const files = names.map((name) => ({ name, data: readFileSync(fixture(name)).toString('base64') }));
  await page.evaluate((given) => {
    const transfer = new DataTransfer();
    for (const { name, data } of given) transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: 'application/pdf' }));
    for (const type of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

async function numberAndDownload(page: Page): Promise<{ download: Download; bytes: Uint8Array }> {
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

/** An engine that reads a file as ready and then does what `run` says, in place of the real one. */
const fakeEngine = (run: string) => `export const loads = { read: ['qpdf'], job: ['qpdf', 'pdflib'] }; export const inspect = async () => ({ kind: 'ready', pages: 3 }); export const run = async () => { ${run} };`;
const engineFile = /\/_astro\/add-page-numbers-[A-Za-z0-9_-]{8}\.js$/;

// ---------------------------------------------------------------------------

test.describe('choosing a file', () => {
  test('lists one row with its first page, pages and size, and no summary line; then "Where the numbers go" with focus on "Bottom centre"', async ({ page }) => {
    await open(page);
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(group(page)).toHaveCount(0);
    // Hold the engine back until "Getting ready" has been seen, so a quick load cannot skip past it.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(engineFile, async (route) => { await held; await route.continue(); });
    await pick(page, 'text.pdf');
    // While the engine loads, the row says so and the option is not shown yet.
    await expect(rows(page)).toContainText('Getting ready');
    await expect(group(page)).toHaveCount(0);
    release();
    await expect(rows(page).filter({ hasText: 'Getting ready' })).toHaveCount(0, { timeout: 30000 });
    const size = formatSize(readFileSync(fixture('text.pdf')).length);
    await expect(rows(page)).toContainText('text.pdf');
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(summary(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(`text.pdf, 3 pages, ${size}.`);
    await expect(group(page)).toBeVisible();
    await expect(place(page, 'Bottom centre')).toBeChecked();
    await expect(place(page, 'Bottom centre')).toBeFocused();
    await expect(group(page).getByRole('radio')).toHaveCount(6);
    for (const [index, name] of places.entries()) await expect(group(page).getByRole('radio').nth(index)).toHaveAccessibleName(name);
    // The option comes after the row and before the main button.
    const order = await page.evaluate(() => {
      const at = (selector: string) => [...document.querySelectorAll('astro-island *')].indexOf(document.querySelector(selector)!);
      return [at('astro-island ol'), at('fieldset'), at('astro-island button[class*=primary], astro-island .actions button:last-of-type')];
    });
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
    await noSidewaysScroll(page);
  });

  test('another file replaces the first, and the place chosen stays', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await place(page, 'Top right').check();
    await pickReady(page, 'mixed.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('mixed.pdf');
    await expect(place(page, 'Top right')).toBeChecked();
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
    await expect(group(page)).toHaveCount(0);
  });
});

test.describe('the place, by keyboard', () => {
  test('arrow keys move the choice within one Tab stop; Tab leaves the group for "Choose another file", then the main button', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await expect(place(page, 'Bottom centre')).toBeFocused();
    // Up twice from "Bottom centre": "Bottom left", then round to "Top right", the sixth of six.
    await page.keyboard.press('ArrowUp');
    await expect(place(page, 'Bottom left')).toBeChecked();
    await page.keyboard.press('ArrowUp');
    await expect(place(page, 'Top right')).toBeChecked();
    await expect(place(page, 'Top right')).toBeFocused();
    await expect(group(page).getByRole('radio').nth(5)).toBeChecked();
    await page.keyboard.press('ArrowDown');
    await expect(place(page, 'Bottom left')).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(place(page, 'Bottom right')).toBeChecked();
    // One Tab stop: Tab leaves the group, to the actions row in its existing order.
    await page.keyboard.press('Tab');
    await expect(anotherFile(page)).toBeFocused();
    await expect(page.locator('label', { hasText: 'Choose another file' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(mainButton(page)).toBeFocused();
    // Shift+Tab twice comes back to the chosen place only, not to every radio button.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(place(page, 'Bottom right')).toBeFocused();
  });
});

test.describe('numbering', () => {
  test('mixed.pdf at "Top left": each page ends with its number, at the top left as PDF.js shows it and not at the bottom centre', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'mixed.pdf');
    await place(page, 'Top left').check();
    const { download, bytes } = await numberAndDownload(page);
    expect(download.suggestedFilename()).toBe('mixed-numbered.pdf');
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 4 pages`);
    for (const note of [
      'Each page has its number. Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
      'The new file has no password and no restrictions, even if the file you chose had them.',
    ]) {
      await expect(page.getByText(note)).toBeVisible();
    }
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, ['--show-npages'])).out.trim()).toBe('4');
    const pages = await texts(bytes);
    pages.forEach((items, index) => expect(items.at(-1)).toBe(String(index + 1)));
    for (const found of await lastTextPlaces(bytes)) {
      expect(found.x).toBeLessThan(0.15);
      expect(found.fromBottom).toBeGreaterThan(0.93);
    }

    await noSidewaysScroll(page);
  });

  test('progress on pages-500.pdf: "Reading the file", then "Page n of 500", then writing, with a bar that never goes back and is not full while writing', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'pages-500.pdf');
    await recordProgress(page);
    await numberAndDownload(page);
    const progress = await recorded(page);
    const lines = [...new Set(progress.map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    // The page shows the latest word from the worker when it next draws, so some page lines are skipped; never all of 500.
    expect(lines[0]).toBe('Reading the file');
    expect(lines.at(-1)).toBe('Writing the numbered file');
    const pageLines = lines.slice(1, -1);
    expect(pageLines.length).toBeGreaterThan(0);
    for (const line of pageLines) expect(line).toMatch(/^Page \d{1,3} of 500$/);
    const values = progress.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    // Pages fill the bar to 80 at most; the write is reported from there, and nothing is full until the file is written.
    for (const step of progress.filter((each) => each.line.startsWith('Page '))) expect(step.value).toBeLessThanOrEqual(80);
    for (const step of progress.slice(0, -1)) expect(step.value).toBeLessThan(100);
  });

  test('the same file at "Bottom centre, untouched, puts each number centred across the bottom', async ({ page }) => {
    await open(page);
    await pickReady(page, 'mixed.pdf');
    const { bytes } = await numberAndDownload(page);
    for (const found of await lastTextPlaces(bytes)) {
      expect(Math.abs(found.x - 0.5)).toBeLessThan(0.03);
      expect(found.fromBottom).toBeLessThan(0.07);
    }
  });

  test('done by keyboard alone: choose a place, number, then Download from the result; "Start again" starts the place afresh', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await page.keyboard.press('ArrowRight');
    await expect(place(page, 'Bottom right')).toBeChecked();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(mainButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.locator('astro-island section')).toContainText(/text-numbered\.pdf/);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Download' })).toBeFocused();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await download).suggestedFilename()).toBe('text-numbered.pdf');
    await page.getByRole('button', { name: 'Start again' }).click();
    await pickReady(page, 'text.pdf');
    await expect(place(page, 'Bottom centre')).toBeChecked();
  });

  test('Cancel stops the job and lists the file again with the same place chosen', async ({ page, context }) => {
    // An engine that never finishes, so Cancel is pressed while the job runs.
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine('await new Promise(() => {});') }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await place(page, 'Top left').check();
    await mainButton(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(rows(page)).toContainText('text.pdf');
    await expect(place(page, 'Top left')).toBeChecked();
    await expect(resultHeading(page)).toHaveCount(0);
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password with no option shown; a wrong one says so; the right one opens it with focus on the place', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused();
    await expect(page.getByText(/stays in (this|your) browser/).first()).toBeVisible();
    await expect(group(page)).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await expect(field).toBeFocused();
    await expect(group(page)).toHaveCount(0);
    await field.fill(password);
    await page.keyboard.press('Enter');
    await expect(place(page, 'Bottom centre')).toBeFocused({ timeout: 30000 });
    const { bytes } = await numberAndDownload(page);
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, ['--show-encryption'])).out).toMatch(/File is not encrypted/);
  });

  test('"Choose another file" in place of the password replaces the file', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    // While the file is read, the actions row's file input (named "Choose another file" too, with a button's role)
    // is on screen; it gives way to the password field's button once the file asks for a password.
    await expect(page.getByLabel('Password for password.pdf')).toBeFocused({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Choose another file' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await pickReady(page, 'text.pdf');
    await expect(place(page, 'Bottom centre')).toBeFocused();
  });

  test('a damaged file says so, shows no option, and offers to choose another', async ({ page }) => {
    await open(page);
    await pick(page, 'damaged-xref.pdf');
    await expect(page.getByRole('heading', { name: 'damaged-xref.pdf is damaged and cannot be read.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
    await expect(group(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
  });

  test('when the engine cannot be fetched, the page says so', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.abort());
    await open(page);
    await pick(page, 'text.pdf');
    await expect(failedHeading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });

  test('when the browser runs out of memory, the page says so and what to try, and the file and its place stay', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine("throw new RangeError('Array buffer allocation failed');") }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await place(page, 'Top centre').check();
    await mainButton(page).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('Your browser ran out of memory. Try on a computer, or split the file first and number the parts.')).toBeVisible();
    await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
    await expect(rows(page)).toContainText('text.pdf');
    await expect(place(page, 'Top centre')).toBeChecked();
  });

  test('when the new file would be far too large, the page says so with its own advice', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine("const error = new Error('x'); error.name = 'OutputLimit'; throw error;") }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await mainButton(page).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText(outputLimitSentence)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go back to your file', exact: true })).toBeVisible();
  });

  test('a file over 100 MB shows the notice, and the main button works @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a file of 120,000 pages shows the notice, and changing the place blocks nothing for more than 100 ms @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(place(page, 'Bottom centre')).toBeChecked();
    await watchLongTasks(page);
    for (const name of ['Top right', 'Bottom left', 'Top centre']) {
      await place(page, name).check();
      await expect(place(page, name)).toBeChecked();
    }
    await page.keyboard.press('ArrowDown');
    await expect(place(page, 'Top right')).toBeChecked();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toBeEnabled();
    expect(await longTasks(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Add page numbers' own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts): with the drawing step it shares with Watermark, pdf-lib and fflate. */
const filesAfterPick = () => toolFiles('add-page-numbers').all;
const fetchedPaths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];
const built = (path: string) => readFileSync(join(here, '../../dist', path), 'utf8');
/** The built files, among those fetched, that hold a sentence from a source file. */
const holding = (fetched: string[], sentence: string) => fetched.filter((path) => /\.m?js$/.test(path) && built(path).includes(sentence));

async function watchedRun(page: Page, given: Given, typed?: string) {
  const consoleText: string[] = [];
  page.on('console', (message) => consoleText.push(message.text()));
  await pick(page, given);
  if (typed) {
    await page.getByLabel(/^Password for /).fill(typed);
    await page.keyboard.press('Enter');
  }
  await waitUntilRead(page, given);
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
  test('a protected file under a telling name, with its password, numbered at "Top left" and downloaded, with only the listed files fetched', async ({ page, context, baseURL }) => {
    await open(page);
    const seen = watch(context, page);
    const consoleText = await watchedRun(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) }, password);
    await place(page, 'Top left').check();
    const { download, bytes } = await numberAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7report-numbered.pdf');
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);

    const secrets = ['qz7report.pdf', 'qz7report', password, 'top-left', 'Top left'];
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = fetchedPaths(seen);
    // The engine, the drawing step (in one file, shared with Watermark) and pdf-lib were fetched, and nothing of another tool's.
    for (const name of [/\/add-page-numbers-/, /\/stamp-/, /\/pdflib-/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    expect(holding(fetched, 'A drawing used an object that cannot be written.').length).toBe(1);
    for (const other of [/\/compress-pdf-/, /\/split-pdf-/, /\/merge-pdf-/, /\/rotate-pdf-/, /\/images-to-pdf-/, /\/pdf-to-images-/, /\/picture-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }
    await expectNothingHeld(page, context, secrets, consoleText);
  });

  test('rich.pdf, tagged.pdf and form.pdf numbered: no bookmark title, attachment name, document title, hidden text or field value leaves', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const secrets = [
      'Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment',
      'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE',
      'A tagged file', 'A fillable form', 'Sample text',
    ];
    await open(page);
    const seen = watch(context, page);
    const consoleText: string[] = [];
    for (const name of ['rich.pdf', 'tagged.pdf', 'form.pdf']) {
      consoleText.push(...(await watchedRun(page, name)));
      await numberAndDownload(page);
      await page.getByRole('button', { name: 'Start again' }).click();
    }
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, consoleText);
  });
});
