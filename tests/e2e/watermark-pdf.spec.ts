// Watermark in a real browser, at a phone width and a desktop width, with the
// real engine: choosing a file, typing the text, watermarking a file and
// checking the download, every state, and the promise that nothing about a
// file, its password or the text typed leaves the device.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, type Download, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createQpdf } from '../../src/engines/qpdf';
import { formatSize } from '../../src/widget/format';
import { changed, pictures, texts } from '../unit/stamp-helpers';
import { builtFiles, headersRead, traces, violations, watch, type Seen } from './no-upload';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixture = (name: string) => join(here, '../fixtures', name);
const password = 'open-sesame';
const typed = 'Kv4wm Qx8mrk';
const hint = 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.';
const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Add watermark and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const summary = (page: Page) => page.locator('astro-island p[tabindex="-1"]');
const status = (page: Page) => page.locator('[role=status]').first();
const field = (page: Page) => page.getByRole('textbox', { name: 'Watermark text' });
const whyNot = (page: Page) => page.locator('#watermark-pdf-why-not');
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your watermarked file is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The watermark was not added.' });
const anotherFile = (page: Page) => page.getByLabel('Choose another file');
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page) {
  await page.goto('/watermark-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

type Given = string | { name: string; mimeType: string; buffer: Buffer };
async function pick(page: Page, file: Given) {
  await picker(page).setInputFiles(typeof file === 'string' ? fixture(file) : file);
}
const nameOf = (file: Given) => (typeof file === 'string' ? file : file.name);

/**
 * Waits until this file is listed and read: its row is there, no row says "Getting ready", and the text field,
 * which shows only once every listed file has been read, is on screen. Checking only that no row says
 * "Getting ready" would pass at once, before the row of a new file is even listed.
 */
async function waitUntilRead(page: Page, file: Given) {
  await expect(rows(page).filter({ hasText: nameOf(file) })).toHaveCount(1, { timeout: 30000 });
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
  await expect(field(page)).toBeVisible({ timeout: 30000 });
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

/** Types the text, checks the main button now works, then presses it and downloads the result. */
async function watermarkAndDownload(page: Page, text = typed): Promise<{ download: Download; bytes: Uint8Array }> {
  await field(page).fill(text);
  await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
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

/** Records each new text of the status region, from the first change after it is called. */
async function recordStatus(page: Page) {
  await page.evaluate(() => {
    const said: string[] = [];
    (window as unknown as { said: string[] }).said = said;
    const region = document.querySelector('[role=status]')!;
    new MutationObserver(() => said.push(region.textContent ?? '')).observe(region, { subtree: true, childList: true, characterData: true });
  });
}
const saidInStatus = (page: Page) => page.evaluate(() => (window as unknown as { said: string[] }).said);

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
const fakeEngine = (run: string) => `export const inspect = async () => ({ kind: 'ready', pages: 3 }); export const run = async () => { ${run} };`;
const engineFile = /\/_astro\/watermark-pdf-[A-Za-z0-9_-]{8}\.js$/;
const pdflibFile = /\/_astro\/pdflib-[A-Za-z0-9_-]{8}\.js$/;

// ---------------------------------------------------------------------------

test.describe('choosing a file', () => {
  test('lists one row with its first page, pages and size, no Remove and no summary line; then the empty field, focused, and the main button waiting', async ({ page }) => {
    await open(page);
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(field(page)).toHaveCount(0);
    // Hold the engine back until "Getting ready" has been seen, so a quick load cannot skip past it.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(engineFile, async (route) => {
      await held;
      await route.continue();
    });
    await pick(page, 'text.pdf');
    // While the engine loads, the row says so and the field is not shown yet.
    await expect(rows(page)).toContainText('Getting ready');
    await expect(field(page)).toHaveCount(0);
    release();
    await waitUntilRead(page, 'text.pdf');
    const size = formatSize(readFileSync(fixture('text.pdf')).length);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(summary(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    await expect(status(page)).toHaveText(`text.pdf, 3 pages, ${size}.`);
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue('');
    await expect(field(page)).toHaveAccessibleDescription(hint);
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toHaveAccessibleDescription('Type the watermark text first.');
    await expect(whyNot(page)).toHaveText('Type the watermark text first.');
    // The field comes after the row and before the main button.
    const order = await page.evaluate(() => {
      const at = (selector: string) => [...document.querySelectorAll('astro-island *')].indexOf(document.querySelector(selector)!);
      return [at('astro-island ol'), at('input[type=text]'), at('#watermark-pdf-main')];
    });
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
    await noSidewaysScroll(page);
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
    await expect(field(page)).toHaveCount(0);
  });
});

test.describe('the text', () => {
  test('the field: its label, its hint read with it, one line with no form memory or spell checking', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await expect(page.locator('label', { hasText: 'Watermark text' })).toBeVisible();
    await expect(page.getByText(hint)).toBeVisible();
    await expect(field(page)).toHaveAttribute('type', 'text');
    await expect(field(page)).toHaveAttribute('autocomplete', 'off');
    await expect(field(page)).toHaveAttribute('spellcheck', 'false');
    await expect(field(page)).not.toHaveAttribute('name', /.*/);
    await expect(field(page)).not.toHaveAttribute('maxlength', /.*/);
  });

  test('while empty, pressing the main button fetches no pdf-lib file and starts no job; text typed makes it work, and Enter starts the job', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    const fetched: string[] = [];
    page.on('request', (request) => fetched.push(request.url()));
    // Playwright will not click a button marked aria-disabled, so these presses skip its checks, as a finger would.
    await mainButton(page).click({ force: true });
    await field(page).fill('   ');
    await mainButton(page).click({ force: true });
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await expect(page.locator('[role=progressbar]')).toHaveCount(0);
    expect(fetched.filter((url) => pdflibFile.test(url))).toEqual([]);
    // Enter in the waiting field is not silent: the reason the button waits is said, on each press.
    await field(page).press('Enter');
    await expect(status(page)).toHaveText('Type the watermark text first.');
    await field(page).press('Enter');
    await expect(status(page)).toHaveText('Type the watermark text first.\u00a0');
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

    await field(page).fill(typed);
    // Checked before pressing: the button works once text is typed.
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(whyNot(page)).toHaveCount(0);
    await field(page).press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 60000 });
    await expect(page.locator('astro-island section')).toContainText('text-watermarked.pdf');
  });

  test('"मसौदा": the field is marked invalid, the sentences sit between the label and the field, are tied to the button and said once, and a press does nothing', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await recordStatus(page);
    await field(page).pressSequentially('मसौदा');
    // The rule is in the hint under the field, so the sentence does not repeat it.
    const sentence = 'Some characters cannot be used.';
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
    const error = page.locator('p[id$="-text-error"]');
    await expect(error).toHaveText(sentence);
    // Between the label and the field, read with the field before the hint, and tied to the main button.
    const order = await page.evaluate(() => {
      const all = [...document.querySelectorAll('astro-island *')];
      const input = document.querySelector('astro-island input[type=text]')!;
      return [all.indexOf(document.querySelector(`label[for="${input.id}"]`)!), all.indexOf(document.getElementById(`${input.id}-error`)!), all.indexOf(input)];
    });
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
    await expect(field(page)).toHaveAccessibleDescription(`${sentence} ${hint}`);
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toHaveAccessibleDescription(sentence);
    // Said once by the status region, not again for each character typed.
    await expect(status(page)).toHaveText(sentence);
    expect((await saidInStatus(page)).filter((said) => said === sentence)).toHaveLength(1);
    // No list of characters for a script.
    await expect(error).not.toContainText('म');
    await mainButton(page).click({ force: true });
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await expect(resultHeading(page)).toHaveCount(0);
  });

  test('"Łódź" names Ł and ź; 63 characters pasted are kept whole with their sentence', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await field(page).fill('Łódź');
    await expect(page.locator('p[id$="-text-error"]')).toHaveText('Ł and ź cannot be used.');
    const long = 'Draft copy for the review meeting, not to be sent on to others.';
    expect([...long]).toHaveLength(63);
    await field(page).fill(long);
    await expect(field(page)).toHaveValue(long);
    await expect(page.locator('p[id$="-text-error"]')).toHaveText('This text has 63 characters. Use 50 or fewer.');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await mainButton(page).click({ force: true });
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  });

  test('Tab goes from the field to "Choose another file", then the main button', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await expect(field(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(anotherFile(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(mainButton(page)).toBeFocused();
  });
});

test.describe('watermarking', () => {
  test('mixed.pdf with "Kv4wm Qx8mrk": passes qpdf --check, each page ends with the text, and the change is centred on each page as PDF.js shows it', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'mixed.pdf');
    const { download, bytes } = await watermarkAndDownload(page);
    expect(download.suggestedFilename()).toBe('mixed-watermarked.pdf');
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 4 pages`);
    for (const note of [
      'The watermark is on every page. Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
      'The new file has no password and no restrictions, even if the file you chose had them.',
    ]) {
      await expect(page.getByText(note)).toBeVisible();
    }
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, ['--show-npages'])).out.trim()).toBe('4');
    for (const items of await texts(bytes)) expect(items.at(-1)).toBe(typed);
    const before = await pictures(new Uint8Array(readFileSync(fixture('mixed.pdf'))));
    const after = await pictures(bytes);
    after.forEach((picture, index) => {
      const box = changed(before[index]!, picture);
      expect(box.n, `page ${index + 1}`).toBeGreaterThan(100);
      expect(Math.abs(box.middleX - 0.5), `page ${index + 1}`).toBeLessThan(0.03);
      expect(Math.abs(box.middleY - 0.5), `page ${index + 1}`).toBeLessThan(0.03);
    });
    await noSidewaysScroll(page);
  });

  test('progress on pages-500.pdf: "Reading the file", then "Page n of 500", then writing, with a bar that never goes back and is not full while writing', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'pages-500.pdf');
    await field(page).fill(typed);
    await recordProgress(page);
    await watermarkAndDownload(page);
    const progress = await recorded(page);
    const lines = [...new Set(progress.map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    expect(lines[0]).toBe('Reading the file');
    expect(lines.at(-1)).toBe('Writing the watermarked file');
    const pageLines = lines.slice(1, -1);
    expect(pageLines.length).toBeGreaterThan(0);
    for (const line of pageLines) expect(line).toMatch(/^Page \d{1,3} of 500$/);
    const values = progress.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const step of progress.filter((each) => each.line.startsWith('Page '))) expect(step.value).toBeLessThanOrEqual(80);
    for (const step of progress.slice(0, -1)) expect(step.value).toBeLessThan(100);
  });

  test('"Start again" empties the field for the next file; "Choose another file" keeps the text', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await field(page).fill('Draft');
    await pickReady(page, 'mixed.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('mixed.pdf');
    await expect(field(page)).toHaveValue('Draft');
    await watermarkAndDownload(page, 'Draft');
    await page.getByRole('button', { name: 'Start again' }).click();
    await pickReady(page, 'text.pdf');
    await expect(field(page)).toHaveValue('');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('Cancel stops the job and lists the file again with the text as typed', async ({ page, context }) => {
    // An engine that never finishes, so Cancel is pressed while the job runs.
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine('await new Promise(() => {});') }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await field(page).fill('Draft');
    await mainButton(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(rows(page)).toContainText('text.pdf');
    await expect(field(page)).toHaveValue('Draft');
    await expect(resultHeading(page)).toHaveCount(0);
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password with no field shown; a wrong one says so; the right one opens it with focus on the text field', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    const passwordField = page.getByLabel('Password for password.pdf');
    await expect(passwordField).toBeFocused();
    await expect(page.getByText(/stays in (this|your) browser/).first()).toBeVisible();
    await expect(field(page)).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
    await passwordField.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await expect(passwordField).toBeFocused();
    await expect(field(page)).toHaveCount(0);
    await passwordField.fill(password);
    await page.keyboard.press('Enter');
    await expect(field(page)).toBeFocused({ timeout: 30000 });
    const { bytes } = await watermarkAndDownload(page);
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, ['--show-encryption'])).out).toMatch(/File is not encrypted/);
  });

  test('a damaged file says so, shows no field, and offers to choose another', async ({ page }) => {
    await open(page);
    await pick(page, 'damaged-xref.pdf');
    await expect(page.getByRole('heading', { name: 'damaged-xref.pdf is damaged and cannot be read.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
    await expect(field(page)).toHaveCount(0);
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

  test('when the browser runs out of memory, the page says so and what to try; "Go back to your file" keeps the file and the text, with focus on the main button', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine("throw new RangeError('Array buffer allocation failed');") }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await field(page).fill('Draft');
    await mainButton(page).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('Your browser ran out of memory. Try on a computer, or split the file first and add the watermark to each part.')).toBeVisible();
    await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
    await expect(rows(page)).toContainText('text.pdf');
    await expect(field(page)).toHaveValue('Draft');
    await expect(mainButton(page)).toBeFocused();
  });

  test('when the new file would be far too large, the page says so with its own advice', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine("const error = new Error('x'); error.name = 'OutputLimit'; throw error;") }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await field(page).fill('Draft');
    await mainButton(page).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText(outputLimitSentence)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go back to your file', exact: true })).toBeVisible();
  });

  test('when the engine refuses the text, the page says so in its own words, and the text stays', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine("const error = new Error('x'); error.name = 'TextRefused'; throw error;") }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await field(page).fill('Draft');
    await mainButton(page).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('The watermark text could not be used. Check it and try again.')).toBeVisible();
    await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
    await expect(field(page)).toHaveValue('Draft');
  });

  test('a file over 100 MB shows the notice, and the main button works once text is typed @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(field(page)).toBeVisible({ timeout: 60000 });
    await field(page).fill('Draft');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a file of 120,000 pages shows the notice, and typing in the field blocks nothing for more than 100 ms @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(field(page)).toBeFocused({ timeout: 120000 });
    await watchLongTasks(page);
    await field(page).pressSequentially('Draft for review', { delay: 20 });
    await expect(field(page)).toHaveValue('Draft for review');
    await page.keyboard.press('Backspace');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toBeEnabled();
    expect(await longTasks(page)).toEqual([]);
  });
});

test.describe('the words below the tool', () => {
  test('the heading, sentence, steps and questions are in the served page, before any script runs', async ({ request }) => {
    const html = await (await request.get('/watermark-pdf')).text();
    for (const words of [
      'Add a watermark to a PDF</h1>',
      'Put your own text across every page of a PDF. Your file stays on your device.',
      'How to add a watermark',
      'Press “Add watermark and download”',
      'Is my file uploaded?',
      'Which characters can I use?',
      'Can someone remove the watermark?',
      'What does not stay the same?',
    ]) {
      expect(html).toContain(words);
    }
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Watermark's own files that may load after a pick, by exact name, read from the build: with the drawing step, pdf-lib and fflate. */
const filesAfterPick = () =>
  builtFiles(
    /^(ToolWorkspace\.[A-Za-z0-9_-]{8}\.js|FilePicker\.[A-Za-z0-9_-]{8}\.css|tool\.worker-[A-Za-z0-9_-]{8}\.js|watermark-pdf-[A-Za-z0-9_-]{8}\.js|stamp-[A-Za-z0-9_-]{8}\.js|option-values-[A-Za-z0-9_-]{8}\.js|plain-[A-Za-z0-9_-]{8}\.js|inspect-[A-Za-z0-9_-]{8}\.js|qpdf-[A-Za-z0-9_-]{8}\.(js|wasm)|thumbnail-[A-Za-z0-9_-]{8}\.js|pdf-[A-Za-z0-9_-]{8}\.js|pdf\.worker\.min-[A-Za-z0-9_-]{8}\.mjs|pdfjs-data-[A-Za-z0-9_-]{8}\.js|pdflib-[A-Za-z0-9_-]{8}\.js|fflate-[A-Za-z0-9_-]{8}\.js)$/,
  );
const fetchedPaths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];
const built = (path: string) => readFileSync(join(here, '../../dist', path), 'utf8');
/** The built files, among those fetched, that hold a sentence from a source file. */
const holding = (fetched: string[], sentence: string) => fetched.filter((path) => /\.m?js$/.test(path) && built(path).includes(sentence));

async function watchedRun(page: Page, given: Given, typedPassword?: string) {
  const consoleText: string[] = [];
  page.on('console', (message) => consoleText.push(message.text()));
  await pick(page, given);
  if (typedPassword) {
    await page.getByLabel(/^Password for /).fill(typedPassword);
    await page.keyboard.press('Enter');
  }
  await waitUntilRead(page, given);
  return consoleText;
}

async function expectNothingHeld(page: Page, context: BrowserContext, secrets: string[], consoleText: string[]) {
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
  test('a protected file under a telling name, with its password and the text "Kv4wm Qx8mrk", watermarked and downloaded, with only the listed files fetched', async ({ page, context, baseURL }) => {
    await open(page);
    const seen = watch(context, page);
    const consoleText = await watchedRun(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) }, password);
    const { download, bytes } = await watermarkAndDownload(page, typed);
    expect(download.suggestedFilename()).toBe('qz7report-watermarked.pdf');
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    for (const items of await texts(bytes)) expect(items.at(-1)).toBe(typed);

    const secrets = ['qz7report.pdf', 'qz7report', password, typed, 'Kv4wm', 'Qx8mrk'];
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = fetchedPaths(seen);
    // The engine, the drawing step (in one file, shared with Add page numbers) and pdf-lib were fetched, and nothing of another tool's.
    for (const name of [/\/watermark-pdf-/, /\/stamp-/, /\/pdflib-/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    expect(holding(fetched, 'A drawing used an object that cannot be written.').length).toBe(1);
    for (const other of [/\/add-page-numbers-/, /\/compress-pdf-/, /\/split-pdf-/, /\/merge-pdf-/, /\/rotate-pdf-/, /\/images-to-pdf-/, /\/pdf-to-images-/, /\/picture-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }
    await expectNothingHeld(page, context, secrets, consoleText);
  });

  test('rich.pdf, tagged.pdf and form.pdf watermarked: no bookmark title, attachment name, document title, hidden text or field value leaves', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const secrets = [
      'Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment',
      'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE',
      'A tagged file', 'A fillable form', 'Sample text', typed, 'Kv4wm', 'Qx8mrk',
    ];
    await open(page);
    const seen = watch(context, page);
    const consoleText: string[] = [];
    for (const name of ['rich.pdf', 'tagged.pdf', 'form.pdf']) {
      consoleText.push(...(await watchedRun(page, name)));
      await watermarkAndDownload(page, typed);
      await page.getByRole('button', { name: 'Start again' }).click();
    }
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, consoleText);
  });
});
