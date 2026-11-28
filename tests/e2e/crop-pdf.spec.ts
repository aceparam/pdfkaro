// Crop PDF in a real browser, at a phone width and a desktop width, with the real engine: choosing a file, cropping
// it, a file where no page is cut, a file that needs a password, progress, Cancel and failures, every other state,
// the words below the tool, and the promise that nothing about a file leaves the device or reaches storage, the
// title, the address or either console.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { type BrowserContext, type ConsoleMessage, type Download, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createQpdf } from '../../src/engines/qpdf';
import { formatSize } from '../../src/widget/format';
import { headersRead, traces, violations, watch, type Seen } from './no-upload';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixture = (name: string) => join(here, '../fixtures', name);
const open = 'open-sesame';
/** The marked password of the file protected in the no-upload test. */
const marked = 'Qz7 pw#%@ Kv4';
const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';
const noneHeading = 'No pages were cropped.';
const noneAdvice =
  'No new file was made. This tool cuts only white margins, and leaves a page as it is when it cannot be sure where everything on it is. Pages with grey or dark edges, such as many scans, are left too. You can use your file as it is.';
const resultNotes = [
  'Each page is cut to what is drawn on it, with a small margin left. Blank pages, pages with no white margin, and pages the tool cannot measure safely are left as they are.',
  'What was cut off is still in the file. Anyone who has the file can get it back, and some programs can still find, copy or read aloud the text in it. Cropping is not a way to hide something private.',
  "Pages, text, links, form fields, notes, bookmarks, attached files and the document's details are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them.",
];

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Crop and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const summary = (page: Page) => page.locator('astro-island p[tabindex="-1"]');
const status = (page: Page) => page.locator('[role=status]').first();
const passwordField = (page: Page) => page.getByLabel(/^Password for /);
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your cropped file is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The pages were not cropped.' });
const anotherFile = (page: Page) => page.getByLabel('Choose another file');
const cancel = (page: Page) => page.getByRole('button', { name: 'Cancel' });
const goBack = (page: Page) => page.getByRole('button', { name: 'Go back to your file', exact: true });
const startAgain = (page: Page) => page.getByRole('button', { name: 'Start again' });
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function openPage(page: Page) {
  await page.goto('/crop-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

type Given = string | { name: string; mimeType: string; buffer: Buffer };
async function pick(page: Page, file: Given) {
  await picker(page).setInputFiles(typeof file === 'string' ? fixture(file) : file);
}
const nameOf = (file: Given) => (typeof file === 'string' ? file : file.name);
const asFile = (name: string, bytes: Uint8Array): Given => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });

/** Waits until this file is listed and read, with the main button on screen. */
async function waitUntilRead(page: Page, file: Given) {
  await expect(rows(page).filter({ hasText: nameOf(file) })).toHaveCount(1, { timeout: 30000 });
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
  await expect(mainButton(page)).toBeVisible({ timeout: 30000 });
}

async function pickReady(page: Page, file: Given, password?: string) {
  await pick(page, file);
  await expect(rows(page)).toHaveCount(1);
  if (password !== undefined) {
    await expect(passwordField(page)).toBeFocused({ timeout: 30000 });
    await passwordField(page).fill(password);
    await page.keyboard.press('Enter');
  }
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

/** Presses the main button and downloads the result. */
async function cropAndDownload(page: Page): Promise<{ download: Download; bytes: Uint8Array }> {
  await mainButton(page).click();
  await expect(resultHeading(page)).toBeFocused({ timeout: 120000 });
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

/** Each page's own crop box and paper box, as qpdf reads them. */
async function boxes(bytes: Uint8Array): Promise<{ crop: unknown; media: unknown }[]> {
  const { out } = await qpdfOn(bytes, ['--json=2', '--json-key=pages', '--json-key=qpdf', '--json-stream-data=none']);
  const parsed = JSON.parse(out) as { pages: { object: string }[]; qpdf: [unknown, Record<string, { value?: Record<string, unknown> }>] };
  return parsed.pages.map(({ object }) => {
    const dict = parsed.qpdf[1][`obj:${object}`]!.value!;
    return { crop: dict['/CropBox'], media: dict['/MediaBox'] };
  });
}

/** Not encrypted, passing qpdf's check with no password. */
async function expectPlain(bytes: Uint8Array) {
  expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
  const { out } = await qpdfOn(bytes, ['--json=2', '--json-key=encrypt']);
  expect((JSON.parse(out) as { encrypt: { encrypted: boolean } }).encrypt.encrypted).toBe(false);
}

/** Each page's text, read by PDF.js. */
async function pageTexts(bytes: Uint8Array, password?: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 });
  try {
    const doc = await task.promise;
    const texts: string[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const content = await (await doc.getPage(number)).getTextContent();
      texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return texts;
  } finally {
    await task.destroy();
  }
}

/** Records every line above the bar and every value of the bar, from the first change after it is called. */
async function recordProgress(page: Page) {
  await page.evaluate(() => {
    const seen: { line: string; value: number }[] = [];
    (window as unknown as { progress: typeof seen }).progress = seen;
    const take = () => {
      const line = document.querySelector('p[class*=progressLine]')?.textContent ?? '';
      const bar = document.querySelector('[role=progressbar]');
      if (!line || !bar) return;
      const value = Number(bar.getAttribute('aria-valuenow'));
      const last = seen.at(-1);
      if (!last || last.line !== line || last.value !== value) seen.push({ line, value });
    };
    new MutationObserver(take).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-valuenow'] });
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

/** No password field carries a `value` attribute, and the page's HTML does not hold the password. */
async function expectNotInMarkup(page: Page, password: string) {
  const markup = await page.evaluate(() => ({
    attributes: [...document.querySelectorAll('input[type=password]')].map((input) => input.getAttribute('value')),
    html: document.documentElement.outerHTML,
  }));
  for (const value of markup.attributes) expect(value).toBeNull();
  expect(markup.html).not.toContain(password);
}

const engineFile = /\/_astro\/crop-pdf-[A-Za-z0-9_-]{8}\.js$/;
/**
 * An engine in place of the real one: it reads password.pdf's way (needs a password, opened by open-sesame, wrong
 * otherwise; any other file is ready) and then does what `run` says, with `options` the job's options.
 */
const fakeEngine = (run: string) =>
  `export const loads = { read: ['qpdf'], job: ['qpdf', 'pdfjs'] }; export const inspect = async (file, password) => file.length !== ${readFileSync(fixture('password.pdf')).length} ? { kind: 'ready', pages: 3 } : password === undefined ? { kind: 'needs-password' } : password === '${open}' ? { kind: 'ready', pages: 3 } : { kind: 'wrong-password' };
   export const run = async (files, options) => { ${run} };`;
/** A fake run that gives a small file only when sent open-sesame, so a result proves the password was kept. */
const givesWithPassword = `if (options.passwords?.[0] !== '${open}') throw new Error('x'); return [new Uint8Array([37, 80, 68, 70, 45])];`;

/** Serves `first` for the engine until `next()` is called, then `then`: each worker fetches the engine again. */
async function routeEngine(context: BrowserContext, first: string, then: string) {
  let body = first;
  await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body }));
  return {
    next: () => {
      body = then;
    },
  };
}

// ---------------------------------------------------------------------------

test.describe('choosing a file', () => {
  test('one row with its first page, pages and size, no Remove and no summary line; "Getting ready" first; then focus on the main button and the status line said once', async ({ page }) => {
    await openPage(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Crop PDF margins' })).toBeVisible();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(mainButton(page)).toHaveCount(0);
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
    await expect(rows(page)).toContainText('Getting ready');
    await recordStatus(page);
    release();
    await waitUntilRead(page, 'text.pdf');
    const size = formatSize(readFileSync(fixture('text.pdf')).length);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(summary(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove text/ })).toHaveCount(0);
    // No option is shown: the main button follows the row.
    await expect(page.locator('astro-island fieldset, astro-island input[type=radio], astro-island input[type=text]')).toHaveCount(0);
    await expect(status(page)).toHaveText(`text.pdf, 3 pages, ${size}.`);
    expect((await saidInStatus(page)).filter((said) => said === `text.pdf, 3 pages, ${size}.`)).toHaveLength(1);
    await expect(mainButton(page)).toBeFocused();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await noSidewaysScroll(page);
  });

  test('keyboard only: Tab goes from "Choose another file" to the main button, Enter starts the job, and focus reaches the result', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'text.pdf');
    await anotherFile(page).focus();
    await page.keyboard.press('Tab');
    await expect(mainButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 60000 });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Download' })).toBeFocused();
  });

  test('two files dropped at once: the first is listed, and the page says the tool takes one file', async ({ page }) => {
    await openPage(page);
    await drop(page, ['text.pdf', 'rich.pdf']);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('text.pdf');
    await expect(page.locator('p:not([role=status])', { hasText: 'This tool takes one file, so rich.pdf was not added.' })).toBeVisible();
  });

  test('a file that is not a PDF is refused by name', async ({ page }) => {
    await openPage(page);
    await pick(page, 'not-a-pdf.pdf');
    await expect(page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
  });
});

test.describe('cropping', () => {
  test('text.pdf: "Page N of 3", then writing, with a bar that never goes back; the three notes; text-cropped.pdf with new crop boxes, the same paper and the same text', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pickReady(page, 'text.pdf');
    await recordProgress(page);
    const { download, bytes } = await cropAndDownload(page);
    expect(download.suggestedFilename()).toBe('text-cropped.pdf');
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 3 pages`);
    for (const each of resultNotes) await expect(page.getByText(each)).toBeVisible();
    const lines = [...new Set((await recorded(page)).map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    expect(lines).toEqual(expect.arrayContaining(['Page 3 of 3', 'Writing the cropped file']));
    for (const line of lines) expect(line).toMatch(/^(Page [1-3] of 3|Writing the cropped file)$/);
    const values = (await recorded(page)).map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    await expectPlain(bytes);
    const original = new Uint8Array(readFileSync(fixture('text.pdf')));
    const [before, after] = [await boxes(original), await boxes(bytes)];
    after.forEach((page, index) => {
      expect(page.media).toEqual(before[index]!.media);
      expect(Array.isArray(page.crop)).toBe(true);
    });
    expect(await pageTexts(bytes)).toEqual(await pageTexts(original));
    await noSidewaysScroll(page);
  });

  test('password.pdf: the field with its note and focus in it; a wrong password said; open-sesame opens it; the result has no password', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused({ timeout: 30000 });
    await expect(field).toHaveAccessibleDescription('The password stays in your browser. It is not sent anywhere.');
    await expect(mainButton(page)).toHaveCount(0);
    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible({ timeout: 30000 });
    await expect(field).toBeFocused();
    await field.fill(open);
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused({ timeout: 30000 });
    await expectNotInMarkup(page, open);
    const { download, bytes } = await cropAndDownload(page);
    expect(download.suggestedFilename()).toBe('password-cropped.pdf');
    await expectPlain(bytes);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(open);
  });

  test('chinese-unembedded.pdf: no pages cropped, with focus on the heading, its advice, no Download, no notes, and Start again emptying the page', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'chinese-unembedded.pdf');
    let downloads = 0;
    page.on('download', () => (downloads += 1));
    await mainButton(page).click();
    const heading = page.getByRole('heading', { name: noneHeading });
    await expect(heading).toBeFocused({ timeout: 30000 });
    await expect(heading).toHaveAccessibleDescription(noneAdvice);
    await expect(page.getByText(noneAdvice)).toBeVisible();
    // It does not claim the file has no white margins: the tool could not be sure of the page.
    await expect(page.getByText(/no white margins/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    for (const each of resultNotes) await expect(page.getByText(each)).toHaveCount(0);
    expect(downloads).toBe(0);
    await startAgain(page).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await noSidewaysScroll(page);
  });
});

test.describe('Cancel and failures', () => {
  test('Cancel stops the job and lists the file again, with the main button ready and no password asked; the next job runs with it', async ({ page, context }) => {
    const engine = await routeEngine(context, fakeEngine('await new Promise(() => {});'), fakeEngine(givesWithPassword));
    await openPage(page);
    await pickReady(page, 'password.pdf', open);
    await mainButton(page).click();
    await cancel(page).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(rows(page)).toContainText('password.pdf');
    await expect(passwordField(page)).toHaveCount(0);
    await expect(resultHeading(page)).toHaveCount(0);
    engine.next();
    await mainButton(page).click();
    await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.locator('astro-island section')).toContainText('password-cropped.pdf');
  });

  const cases: [string, string, string][] = [
    ['the browser runs out of memory', "throw new RangeError('Array buffer allocation failed');", 'Your browser ran out of memory. Try on a computer, or split the file first and crop the parts.'],
    ['the new file would be far too large', "const error = new Error('x'); error.name = 'OutputLimit'; throw error;", outputLimitSentence],
  ];
  for (const [what, run, sentence] of cases) {
    test(`when ${what}, the page says so; "Go back to your file" lists it, focus on the main button, and the job runs again without the password typed again`, async ({ page, context }) => {
      const engine = await routeEngine(context, fakeEngine(run), fakeEngine(givesWithPassword));
      await openPage(page);
      await pickReady(page, 'password.pdf', open);
      await mainButton(page).click();
      await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
      await expect(page.getByText(sentence)).toBeVisible();
      engine.next();
      await goBack(page).click();
      await expect(rows(page)).toContainText('password.pdf');
      await expect(passwordField(page)).toHaveCount(0);
      await expect(mainButton(page)).toBeFocused();
      await mainButton(page).click();
      await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
    });
  }

  test('when the engine cannot be fetched, the page says so', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.abort());
    await openPage(page);
    await pick(page, 'text.pdf');
    await expect(failedHeading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });
});

test.describe('problems with the file', () => {
  for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf']) {
    test(`${name} says it is damaged, shows no main button, and offers to choose another`, async ({ page }) => {
      await openPage(page);
      await pick(page, name);
      await expect(page.getByRole('heading', { name: `${name} is damaged and cannot be read.` })).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
      await expect(mainButton(page)).toHaveCount(0);
      await page.getByRole('button', { name: 'Choose another file' }).click();
      await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    });
  }

  test('a file over 100 MB shows the notice, and the main button is ready @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await openPage(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page)).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a file of 120,000 pages shows the notice, and the main button is ready @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await openPage(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(mainButton(page)).toBeFocused({ timeout: 120000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('the words below the tool', () => {
  test('the title, heading, sentence, steps and questions are in the served page, before any script runs', async ({ request }) => {
    const html = await (await request.get('/crop-pdf')).text();
    expect(html).toContain('<title>Crop PDF margins in your browser - PDFkaro</title>');
    expect(html).toContain('content="Cut the white margins off the pages of a PDF. The file stays on your device and is not uploaded."');
    for (const words of [
      'Crop PDF margins</h1>',
      'Cut the white margins off the pages of a PDF. Your file stays on your device.',
      'How to crop the margins of a PDF',
      'Press “Crop and download”',
      'Is my file uploaded?',
      'How does it decide where to cut?',
      'Anything on the page that is not white counts, even a light grey line or an empty form box. About 5 mm is left around it on an A4 page.',
      'Why are my pages different sizes now?',
      'Is what I cut off gone?',
      'Anyone who has the file can get it back, and some programs can still find, copy or read aloud the text in it.',
      'Cropping is not a way to hide something private.',
      'Can I choose how much to cut?',
      'report-cropped.pdf',
    ]) {
      expect(html).toContain(words);
    }
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** This tool's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts). */
const filesAfterPick = () => toolFiles('crop-pdf').all;
const fetchedPaths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];

/** Every console message of the page and of each of its workers, as its text and its arguments, and every page error. */
function listen(page: Page) {
  const said: string[] = [];
  const errors: string[] = [];
  const take = (message: ConsoleMessage) => {
    said.push(message.text());
    for (const arg of message.args()) {
      void arg
        .jsonValue()
        .then((value) => said.push(JSON.stringify(value) ?? String(value)))
        .catch(() => said.push(String(arg)));
    }
  };
  page.on('console', take);
  page.on('worker', (worker) => worker.on('console', take));
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
  return { said, errors };
}

async function expectNothingHeld(page: Page, context: BrowserContext, secrets: string[], said: string[]) {
  const held = await traces(page, context);
  expect(held).toMatchObject({ local: 0, session: 0, databases: 0, caches: 0, opfs: [], cookies: [] });
  const address = new URL(held.address);
  expect(address.search).toBe('');
  expect(address.hash).toBe('');
  for (const secret of secrets) {
    expect(held.title).not.toContain(secret);
    expect(decodeURIComponent(held.address)).not.toContain(secret);
    for (const line of said) expect(line).not.toContain(secret);
  }
}

/** Each secret as typed and URL-encoded. */
const withEncoded = (secrets: string[]) => [...new Set(secrets.flatMap((secret) => [secret, encodeURIComponent(secret)]))];

/**
 * A file made here: a page of text, a form field filled with SECRET-field, and SECRET-margin drawn in white in a
 * margin the crop cuts off; protected with the marked password.
 */
async function markedFile(): Promise<{ bytes: Uint8Array; text: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const text = 'Quarterly figures for the north office';
  page.drawText(text, { x: 150, y: 500, size: 14, font, color: rgb(0, 0, 0) });
  page.drawText('SECRET-margin', { x: 30, y: 30, size: 8, font, color: rgb(1, 1, 1) });
  const field = doc.getForm().createTextField('name');
  field.addToPage(page, { x: 150, y: 440, width: 200, height: 20 });
  field.setText('SECRET-field');
  const plain = await doc.save({ useObjectStreams: false });
  const tool = await qpdf();
  tool.write('/in.pdf', plain);
  const made = tool.call(['/in.pdf', '--encrypt', `--user-password=${marked}`, `--owner-password=${marked}`, '--bits=256', '--', '/out.pdf']);
  expect(made.code).toBe(0);
  return { bytes: tool.read('/out.pdf'), text };
}

test.describe('nothing is uploaded', () => {
  test('qz7report.pdf, protected with "Qz7 pw#%@ Kv4", with text in a cut-off margin and a field value: only the listed files fetched, nothing named, both consoles silent on them', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const { bytes: file, text } = await markedFile();
    // Watched before the page opens, so the tool worker's console is heard from its start.
    const heard = listen(page);
    await openPage(page);
    const seen = watch(context, page);
    await pick(page, asFile('qz7report.pdf', file));
    await expect(passwordField(page)).toBeFocused({ timeout: 30000 });
    await passwordField(page).fill(marked);
    await page.keyboard.press('Enter');
    await waitUntilRead(page, 'qz7report.pdf');
    await expectNotInMarkup(page, marked);
    const { download, bytes } = await cropAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7report-cropped.pdf');
    await expectPlain(bytes);
    // The margin was cut off, so the white words lie outside the new crop box; the field's value is kept.
    const [cropped] = await boxes(bytes);
    expect((cropped!.crop as number[])[1]).toBeGreaterThan(40);

    const secrets = withEncoded(['qz7report.pdf', 'qz7report', marked, 'Qz7', 'pw#%@', 'Kv4', text, 'SECRET-margin', 'SECRET-field']);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = fetchedPaths(seen);
    // The engine was fetched with PDF.js and the page reading, and nothing of the drawing step, the option values, pdf-lib, fflate or another tool.
    for (const name of [/\/crop-pdf-/, /\/qpdf-/, /\/inspect-/, /\/plain-/, /\/pages-[A-Za-z0-9_-]{8}\.js$/, /\/pdf-[A-Za-z0-9_-]{8}\.js$/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    for (const other of [/\/stamp-/, /\/option-values-/, /\/pdflib-/, /\/fflate-/, /\/picture-/, /\/protect-pdf-/, /\/compress-pdf-/, /\/compress-to-target-/, /\/shrink-/, /\/merge-pdf-/, /\/rotate-pdf-/, /\/sign-pdf-/, /\/grayscale-pdf-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });

  test('rich.pdf, tagged.pdf and form.pdf: no bookmark title, attachment name, document title, hidden text or field value leaves, and the address holds nothing', async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    const secrets = withEncoded([
      'Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment',
      'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE',
      'A tagged file', 'A fillable form', 'Sample text',
    ]);
    const heard = listen(page);
    await openPage(page);
    const seen = watch(context, page);
    for (const name of ['rich.pdf', 'tagged.pdf', 'form.pdf']) {
      await pickReady(page, name);
      await cropAndDownload(page);
      await startAgain(page).click();
    }
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });
});
