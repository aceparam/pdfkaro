// Resize pages in a real browser, at a phone width and a desktop width, with the real engine: choosing a file, the
// paper size by mouse and by keyboard, resizing, a file where every page is already the size chosen, a file that
// needs a password, progress, Cancel and failures, every other state, the words below the tool, and the promise
// that nothing about a file leaves the device or reaches storage, the title, the address or either console.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const unsafeSentence = 'A page of this file could not be resized, so no new file was made. The file may be damaged. Try another copy of it.';
const noneHeading = 'Every page is already the paper size you chose.';
const noneAdvice = 'No new file was made. You can use your file as it is. To make the pages the other size, press Start again, choose the file and pick the other size.';
const resultNotes = [
  'Each page is now the paper size you chose, the same way round as before. What is on it is made smaller or larger to fit, keeping its shape, and centred, so a page of another shape has white space at two edges. Pages that were already that size are left as they are.',
  "Text, links, form fields, notes, bookmarks, attached files and the document's details are kept, and links, fields and notes move with the page. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them.",
];

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Resize and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const summary = (page: Page) => page.locator('astro-island p[tabindex="-1"]');
const status = (page: Page) => page.locator('[role=status]').first();
const group = (page: Page) => page.getByRole('group', { name: 'Paper size' });
const a4 = (page: Page) => group(page).getByRole('radio', { name: 'A4, 210 by 297 mm', exact: true });
const letter = (page: Page) => group(page).getByRole('radio', { name: 'Letter, 8.5 by 11 inches', exact: true });
const passwordField = (page: Page) => page.getByLabel(/^Password for /);
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your resized file is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The pages were not resized.' });
const anotherFile = (page: Page) => page.getByLabel('Choose another file');
const cancel = (page: Page) => page.getByRole('button', { name: 'Cancel' });
const goBack = (page: Page) => page.getByRole('button', { name: 'Go back to your file', exact: true });
const startAgain = (page: Page) => page.getByRole('button', { name: 'Start again' });
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function openPage(page: Page) {
  await page.goto('/resize-pdf');
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
async function resizeAndDownload(page: Page): Promise<{ download: Download; bytes: Uint8Array }> {
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

/** Each page's paper box, crop box and own content streams, decoded, as qpdf reads them. */
async function pagesOf(bytes: Uint8Array): Promise<{ media: unknown; crop: unknown; streams: string[] }[]> {
  const tool = await qpdf();
  tool.write('/r.pdf', bytes);
  const { code } = tool.call(['--json=2', '--json-key=pages', '--json-key=qpdf', '--json-stream-data=inline', '--decode-level=generalized', '/r.pdf', '/o.json']);
  expect([0, 3]).toContain(code);
  const parsed = JSON.parse(new TextDecoder().decode(tool.read('/o.json'))) as {
    pages: { object: string; contents: string[] }[];
    qpdf: [unknown, Record<string, { value?: Record<string, unknown>; stream?: { data?: string } }>];
  };
  const objects = parsed.qpdf[1];
  return parsed.pages.map(({ object, contents }) => {
    const dict = objects[`obj:${object}`]!.value!;
    return { media: dict['/MediaBox'], crop: dict['/CropBox'], streams: contents.map((id) => Buffer.from(objects[`obj:${id}`]?.stream?.data ?? '', 'base64').toString('latin1')) };
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

const engineFile = /\/_astro\/resize-pdf-[A-Za-z0-9_-]{8}\.js$/;
/**
 * An engine in place of the real one: it reads password.pdf's way (needs a password, opened by open-sesame, wrong
 * otherwise; any other file is ready) and then does what `run` says, with `options` the job's options.
 */
const fakeEngine = (run: string) =>
  `export const loads = { read: ['qpdf'], job: ['qpdf'] }; export const inspect = async (file, password) => file.length !== ${readFileSync(fixture('password.pdf')).length} ? { kind: 'ready', pages: 3 } : password === undefined ? { kind: 'needs-password' } : password === '${open}' ? { kind: 'ready', pages: 3 } : { kind: 'wrong-password' };
   export const run = async (files, options) => { ${run} };`;
/** A fake run that gives a small file only when sent open-sesame and Letter, so a result proves both were kept. */
const givesWithPasswordAndLetter = `if (options.passwords?.[0] !== '${open}' || options.paper !== 'letter') throw new Error('x'); return [new Uint8Array([37, 80, 68, 70, 45])];`;

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
  test('"Getting ready" first; then one row with its first page, pages and size, no summary line; then "Paper size" with A4 chosen and focused, then the main button; the status line said once', async ({ page }) => {
    await openPage(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Resize PDF pages to A4 or Letter' })).toBeVisible();
    await expect(page.getByText('Make every page of a PDF A4 or Letter size, scaled to fit. Your file stays on your device.')).toBeVisible();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(mainButton(page)).toHaveCount(0);
    await expect(group(page)).toHaveCount(0);
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
    await expect(group(page)).toHaveCount(0);
    // As on every tool, the main button is on screen while the file is read, and cannot be used yet.
    await expect(mainButton(page)).toBeDisabled();
    await recordStatus(page);
    release();
    await waitUntilRead(page, 'text.pdf');
    const size = formatSize(readFileSync(fixture('text.pdf')).length);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(summary(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove text/ })).toHaveCount(0);
    await expect(status(page)).toHaveText(`text.pdf, 3 pages, ${size}.`);
    expect((await saidInStatus(page)).filter((said) => said === `text.pdf, 3 pages, ${size}.`)).toHaveLength(1);
    await expect(group(page).getByRole('radio')).toHaveCount(2);
    await expect(group(page).getByRole('radio').nth(0)).toHaveAccessibleName('A4, 210 by 297 mm');
    await expect(group(page).getByRole('radio').nth(1)).toHaveAccessibleName('Letter, 8.5 by 11 inches');
    await expect(a4(page)).toBeChecked();
    await expect(a4(page)).toBeFocused();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    const order = await page.evaluate(() => {
      const at = (selector: string) => [...document.querySelectorAll('astro-island *')].indexOf(document.querySelector(selector)!);
      return [at('astro-island ol'), at('fieldset'), at('astro-island button[class*=primary], astro-island .actions button:last-of-type')];
    });
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
    await noSidewaysScroll(page);
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
    await expect(group(page)).toHaveCount(0);
  });

  test('another file replaces the first, and the paper size chosen stays', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'text.pdf');
    await letter(page).check();
    await pickReady(page, 'mixed.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('mixed.pdf');
    await expect(letter(page)).toBeChecked();
  });
});

test.describe('resizing', () => {
  test('keyboard only: the down arrow chooses Letter, Tab past "Choose another file" reaches the main button, Enter resizes, and focus reaches the result; text-resized.pdf is Letter with the same content and text', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await picker(page).focus();
    await picker(page).setInputFiles(fixture('text.pdf'));
    await waitUntilRead(page, 'text.pdf');
    await expect(a4(page)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(letter(page)).toBeChecked();
    await expect(letter(page)).toBeFocused();
    await expect(group(page).getByRole('radio').nth(1)).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(anotherFile(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(mainButton(page)).toBeFocused();
    // A visible focus outline on the main button.
    expect(await mainButton(page).evaluate((button) => getComputedStyle(button).outlineStyle)).not.toBe('none');
    await recordProgress(page);
    await page.keyboard.press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 60000 });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Download' })).toBeFocused();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const done = await download;
    expect(done.suggestedFilename()).toBe('text-resized.pdf');
    const bytes = new Uint8Array(readFileSync((await done.path())!));
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 3 pages`);
    for (const each of resultNotes) await expect(page.getByText(each)).toBeVisible();
    const lines = [...new Set((await recorded(page)).map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    expect(lines).toEqual(expect.arrayContaining(['Page 3 of 3', 'Writing the resized file']));
    for (const line of lines) expect(line).toMatch(/^(Reading the file|Page [1-3] of 3|Writing the resized file)$/);
    const values = (await recorded(page)).map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    await expectPlain(bytes);
    const original = new Uint8Array(readFileSync(fixture('text.pdf')));
    const [before, after] = [await pagesOf(original), await pagesOf(bytes)];
    after.forEach((each, index) => {
      expect(each.media).toEqual([0, 0, 612, 792]);
      expect(each.crop).toEqual([0, 0, 612, 792]);
      expect(each.streams[0]).toMatch(/^q\n/);
      expect(each.streams.at(-1)).toBe('\nQ\n');
      expect(each.streams.slice(1, -1)).toEqual(before[index]!.streams);
    });
    expect(await pageTexts(bytes)).toEqual(await pageTexts(original));
    await noSidewaysScroll(page);
  });

  test('text.pdf with A4: every page already the size, with focus on the heading, its words, no Download, no notes, and Start again emptying the page', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'text.pdf');
    await expect(a4(page)).toBeChecked();
    let downloads = 0;
    page.on('download', () => (downloads += 1));
    await mainButton(page).click();
    const heading = page.getByRole('heading', { name: noneHeading });
    await expect(heading).toBeFocused({ timeout: 30000 });
    await expect(heading).toHaveAccessibleDescription(noneAdvice);
    await expect(page.getByText(noneAdvice)).toBeVisible();
    await expect(page.getByText(/damaged/)).toHaveCount(0);
    await expect(failedHeading(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    for (const each of resultNotes) await expect(page.getByText(each)).toHaveCount(0);
    expect(downloads).toBe(0);
    await startAgain(page).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('password.pdf: the field with its note and focus in it; a wrong password said; open-sesame opens it and focus goes to A4; the result has no password', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused({ timeout: 30000 });
    await expect(field).toHaveAccessibleDescription('The password stays in your browser. It is not sent anywhere.');
    await expect(mainButton(page)).toHaveCount(0);
    await expect(group(page)).toHaveCount(0);
    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible({ timeout: 30000 });
    await expect(field).toBeFocused();
    await field.fill(open);
    await page.keyboard.press('Enter');
    await expect(a4(page)).toBeFocused({ timeout: 30000 });
    await expectNotInMarkup(page, open);
    await letter(page).check();
    const { download, bytes } = await resizeAndDownload(page);
    expect(download.suggestedFilename()).toBe('password-resized.pdf');
    await expectPlain(bytes);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(open);
  });
});

test.describe('Cancel and failures', () => {
  test('Cancel stops the job and lists the file again with Letter still chosen, focus on the main button and no password asked; the next job runs with both', async ({ page, context }) => {
    const engine = await routeEngine(context, fakeEngine('await new Promise(() => {});'), fakeEngine(givesWithPasswordAndLetter));
    await openPage(page);
    await pickReady(page, 'password.pdf', open);
    await letter(page).check();
    await mainButton(page).click();
    await cancel(page).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(rows(page)).toContainText('password.pdf');
    await expect(letter(page)).toBeChecked();
    await expect(passwordField(page)).toHaveCount(0);
    await expect(resultHeading(page)).toHaveCount(0);
    engine.next();
    await mainButton(page).click();
    await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.locator('astro-island section')).toContainText('password-resized.pdf');
  });

  const cases: [string, string, string][] = [
    ['the browser runs out of memory', "throw new RangeError('Array buffer allocation failed');", 'Your browser ran out of memory. Try on a computer, or split the file first and resize the parts.'],
    ['the new file would be far too large', "const error = new Error('x'); error.name = 'OutputLimit'; throw error;", outputLimitSentence],
    ['a page cannot be resized', "const error = new Error('x'); error.name = 'UnsafePage'; throw error;", unsafeSentence],
  ];
  for (const [what, run, sentence] of cases) {
    test(`when ${what}, the page says so under "The pages were not resized."; "Go back to your file" keeps the file, its password and Letter, and the job runs again`, async ({ page, context }) => {
      const engine = await routeEngine(context, fakeEngine(run), fakeEngine(givesWithPasswordAndLetter));
      await openPage(page);
      await pickReady(page, 'password.pdf', open);
      await letter(page).check();
      await mainButton(page).click();
      await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
      await expect(page.getByText(sentence)).toBeVisible();
      engine.next();
      await goBack(page).click();
      await expect(rows(page)).toContainText('password.pdf');
      await expect(passwordField(page)).toHaveCount(0);
      await expect(letter(page)).toBeChecked();
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
    test(`${name} says it is damaged, shows no option or main button, and offers to choose another`, async ({ page }) => {
      await openPage(page);
      await pick(page, name);
      await expect(page.getByRole('heading', { name: `${name} is damaged and cannot be read.` })).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
      await expect(mainButton(page)).toHaveCount(0);
      await expect(group(page)).toHaveCount(0);
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
    await expect(a4(page)).toBeFocused({ timeout: 120000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('the words below the tool', () => {
  test('the title, heading, sentence, steps and questions are in the served page, before any script runs', async ({ request }) => {
    const html = await (await request.get('/resize-pdf')).text();
    expect(html).toContain('<title>Resize PDF pages to A4 or Letter in your browser - PDFkaro</title>');
    expect(html).toContain('content="Make every page of a PDF A4 or Letter size, its content scaled to fit. The file stays on your device and is not uploaded."');
    for (const words of [
      'Resize PDF pages to A4 or Letter</h1>',
      'Make every page of a PDF A4 or Letter size, scaled to fit. Your file stays on your device.',
      'How to resize the pages of a PDF',
      'Choose A4 or Letter.',
      'Press “Resize and download”',
      'Is my file uploaded?',
      'What happens to a page of another shape?',
      'Will a small page be made larger?',
      'Which way round will my pages be?',
      'Will parts I cropped out show again?',
      'whether made by mistake or on purpose',
      'Cropping or resizing is not a way to hide something private.',
      'Why did I get no new file?',
      'Do links, forms and bookmarks still work?',
      'Text you type into a form field afterwards may look larger on a page that was made much smaller, and a digital signature will no longer be valid.',
      'press Start again, choose the file again and pick the other size.',
      'a note, link or form field that was wholly out of view is hidden and stays in the file, and one partly out of view may now show more of it, or all of it.',
      'What is removed?',
      'Will this make my file smaller?',
      'report-resized.pdf',
    ]) {
      expect(html).toContain(words);
    }
    const body = html.replace(/<script[^]*?<\/script>|<style[^]*?<\/style>/g, '');
    // No exclamation mark anywhere in the served words (the doctype and comments aside).
    expect(body.replace(/<!/g, '')).not.toContain('!');
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** This tool's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts). */
const filesAfterPick = () => toolFiles('resize-pdf').all;
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

/** A PDF written by hand from object bodies: `bodies[0]` is object 1, the catalog. */
function handWritten(bodies: readonly string[]): Uint8Array {
  const parts: string[] = ['%PDF-1.7\n'];
  const offsets: number[] = [];
  let size = parts[0]!.length;
  bodies.forEach((body, index) => {
    offsets[index + 1] = size;
    const text = `${index + 1} 0 obj\n${body}\nendobj\n`;
    parts.push(text);
    size += Buffer.byteLength(text, 'latin1');
  });
  const count = bodies.length + 1;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  parts.push(table, `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`);
  return new Uint8Array(Buffer.from(parts.join(''), 'latin1'));
}

/**
 * A file made here: a Letter page of text whose crop box hides SECRET-hidden, a link to
 * https://example.invalid/SECRET-uri, a named destination SECRET-dest, a bookmark SECRET-bookmark and a field filled
 * with SECRET-field; protected with the marked password.
 */
async function markedFile(): Promise<{ bytes: Uint8Array; text: string }> {
  const text = 'Quarterly figures for the north office';
  const content = `BT /F1 14 Tf 100 500 Td (${text}) Tj ET BT /F1 10 Tf 100 760 Td (SECRET-hidden) Tj ET`;
  const plain = handWritten([
    '<< /Type /Catalog /Pages 2 0 R /Dests << /SECRET-dest [3 0 R /XYZ 100 500 0] >> /Outlines 7 0 R /AcroForm << /Fields [6 0 R] /DA (/F1 12 Tf 0 g) /DR << /Font << /F1 5 0 R >> >> >> >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox [0 0 612 700] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [8 0 R 6 0 R] >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (SECRET-field) /Rect [100 400 300 420] /F 4 /DA (/F1 12 Tf 0 g) /P 3 0 R >>',
    '<< /Type /Outlines /First 9 0 R /Last 9 0 R /Count 1 >>',
    '<< /Type /Annot /Subtype /Link /Rect [100 495 400 515] /Border [0 0 0] /A << /S /URI /URI (https://example.invalid/SECRET-uri) >> >>',
    '<< /Title (SECRET-bookmark) /Parent 7 0 R /Dest [3 0 R /XYZ 100 500 0] >>',
  ]);
  const tool = await qpdf();
  tool.write('/in.pdf', plain);
  const made = tool.call(['/in.pdf', '--encrypt', `--user-password=${marked}`, `--owner-password=${marked}`, '--bits=256', '--', '/out.pdf']);
  expect(made.code).toBe(0);
  return { bytes: tool.read('/out.pdf'), text };
}

test.describe('nothing is uploaded', () => {
  test('qz7report.pdf, protected with "Qz7 pw#%@ Kv4", with text a crop box hides, a link, a named destination, a bookmark and a field value, resized to Letter: only the listed files fetched, nothing named, both consoles silent on them', async ({ page, context, baseURL }) => {
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
    // Letter is the file's own size: the crop box makes the shown page 612 by 700, so it is resized to Letter.
    await letter(page).check();
    const { download, bytes } = await resizeAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7report-resized.pdf');
    await expectPlain(bytes);
    const [resized] = await pagesOf(bytes);
    expect(resized!.media).toEqual([0, 0, 612, 792]);

    const secrets = withEncoded(['qz7report.pdf', 'qz7report', marked, 'Qz7', 'pw#%@', 'Kv4', text, 'SECRET-hidden', 'https://example.invalid/SECRET-uri', 'SECRET-uri', 'SECRET-dest', 'SECRET-bookmark', 'SECRET-field']);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = fetchedPaths(seen);
    // The engine was fetched with the page reading and the option values, and nothing of the drawing step, pdf-lib, fflate or another tool.
    for (const name of [/\/resize-pdf-/, /\/qpdf-/, /\/inspect-/, /\/plain-/, /\/pages-[A-Za-z0-9_-]{8}\.js$/, /\/option-values-/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    for (const other of [/\/stamp-/, /\/pdflib-/, /\/fflate-/, /\/picture-/, /\/crop-pdf-/, /\/protect-pdf-/, /\/compress-pdf-/, /\/compress-to-target-/, /\/shrink-/, /\/merge-pdf-/, /\/rotate-pdf-/, /\/sign-pdf-/, /\/add-page-numbers-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });

  test('rich.pdf, tagged.pdf and form.pdf resized to Letter: no bookmark title, attachment name, document title, hidden text or field value leaves, and the address holds nothing', async ({ page, context, baseURL }) => {
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
      await letter(page).check();
      await resizeAndDownload(page);
      await startAgain(page).click();
    }
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });
});
