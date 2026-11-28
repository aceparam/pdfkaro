// Remove a password (the catalogue's Unlock PDF, at /unlock-pdf) in a real browser, at a phone width and a desktop
// width, with the real engine: choosing a file, a file with restrictions only, a file that needs a password, a
// file with nothing to remove, progress, Cancel and failures, how long the page holds the password, every other
// state, and the promise that nothing about a file or its password leaves the device or reaches the markup,
// storage, the title, the address or either console.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, type ConsoleMessage, type Download, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectRepairLink } from './repair-link';
import { createQpdf } from '../../src/engines/qpdf';
import { formatSize } from '../../src/widget/format';
import { certificatePdf } from '../unit/unlock-helpers';
import { headersRead, traces, violations, watch, type Seen } from './no-upload';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixture = (name: string) => join(here, '../fixtures', name);
const open = 'open-sesame';
const ownerSecret = 'owner-secret';
/** The marked password of files protected in the test. */
const marked = 'Qz7 pw#%@ Kv4';
const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';
const nothingHeading = 'This file has no password or restrictions.';
const nothingAdvice = 'There was nothing to remove, so no new file was made. You can use your file as it is.';
const certificateAdvice = 'It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection.';
const resultNotes = [
  'The file now opens without a password, and its print, copy and edit restrictions are removed. Anyone who has this copy can open it.',
  'Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
];

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Remove protection and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const summary = (page: Page) => page.locator('astro-island p[tabindex="-1"]');
const status = (page: Page) => page.locator('[role=status]').first();
const passwordField = (page: Page) => page.getByLabel(/^Password for /);
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your unprotected file is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The protection was not removed.' });
const anotherFile = (page: Page) => page.getByLabel('Choose another file');
const cancel = (page: Page) => page.getByRole('button', { name: 'Cancel' });
const goBack = (page: Page) => page.getByRole('button', { name: 'Go back to your file', exact: true });
const startAgain = (page: Page) => page.getByRole('button', { name: 'Start again' });
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function openPage(page: Page) {
  await page.goto('/unlock-pdf');
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
async function removeAndDownload(page: Page): Promise<{ download: Download; bytes: Uint8Array }> {
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

/** A file from the test set protected here with qpdf, with the marked password for opening and for permissions. */
async function protectedCopy(name: string): Promise<Uint8Array> {
  const tool = await qpdf();
  tool.write('/in.pdf', new Uint8Array(readFileSync(fixture(name))));
  const made = tool.call(['/in.pdf', '--encrypt', `--user-password=${marked}`, `--owner-password=${marked}`, '--bits=256', '--', '/out.pdf']);
  expect(made.code).toBe(0);
  return tool.read('/out.pdf');
}

/** Not encrypted, passing qpdf's check with no password. */
async function expectUnprotected(bytes: Uint8Array) {
  expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
  const { code, out } = await qpdfOn(bytes, ['--json=2', '--json-key=encrypt']);
  expect(code).toBe(0);
  expect((JSON.parse(out) as { encrypt: { encrypted: boolean } }).encrypt.encrypted).toBe(false);
}

/** Opens a file in PDF.js: its page count, or the name of the error. */
async function pdfjsOpens(bytes: Uint8Array, password?: string): Promise<number | string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 });
  try {
    return (await task.promise).numPages;
  } catch (error) {
    return error instanceof Error ? error.name : 'unknown';
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

/** No password field carries a `value` attribute, and the page's HTML does not hold the password. */
async function expectNotInMarkup(page: Page, password: string) {
  const markup = await page.evaluate(() => ({
    attributes: [...document.querySelectorAll('input[type=password]')].map((input) => input.getAttribute('value')),
    html: document.documentElement.outerHTML,
  }));
  for (const value of markup.attributes) expect(value).toBeNull();
  expect(markup.html).not.toContain(password);
  expect(markup.html).not.toContain(password.replaceAll('&', '&amp;'));
}

const engineFile = /\/_astro\/unlock-pdf-[A-Za-z0-9_-]{8}\.js$/;
/**
 * An engine in place of the real one: it reads password.pdf's way (needs a password, opened by open-sesame, wrong
 * otherwise; any other file is ready) and then does what `run` says, with `options` the job's options.
 */
const fakeEngine = (run: string) =>
  `export const loads = { read: ['qpdf'], job: ['qpdf'] }; export const inspect = async (file, password) => file.length !== ${readFileSync(fixture('password.pdf')).length} ? { kind: 'ready', pages: 3 } : password === undefined ? { kind: 'needs-password' } : password === '${open}' ? { kind: 'ready', pages: 3 } : { kind: 'wrong-password' };
   export const run = async (files, options) => { ${run} };`;
/** A fake run that gives a small file only when sent open-sesame, so a result proves the password was kept. */
const givesWithPassword = `if (options.passwords?.[0] !== '${open}') throw new Error('x'); return [new Uint8Array([37, 80, 68, 70, 45])];`;

/**
 * Serves `first` for the engine until `next()` is called, then `then`: each worker fetches the engine again, so the
 * job after a failure or Cancel runs the second.
 */
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
    await pick(page, 'restricted.pdf');
    await expect(rows(page)).toContainText('Getting ready');
    await recordStatus(page);
    // The main button waits while the file is read.
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    release();
    await waitUntilRead(page, 'restricted.pdf');
    const size = formatSize(readFileSync(fixture('restricted.pdf')).length);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(summary(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove restricted/ })).toHaveCount(0);
    // No password is asked for a file with restrictions only.
    await expect(passwordField(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(`restricted.pdf, 3 pages, ${size}.`);
    expect((await saidInStatus(page)).filter((said) => said === `restricted.pdf, 3 pages, ${size}.`)).toHaveLength(1);
    await expect(mainButton(page)).toBeFocused();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await noSidewaysScroll(page);
  });

  test('Tab goes from "Choose another file" to the main button, and Enter starts the job', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'restricted.pdf');
    await anotherFile(page).focus();
    await page.keyboard.press('Tab');
    await expect(mainButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 60000 });
  });

  test('Space on the main button starts the job too', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'restricted.pdf');
    await expect(mainButton(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(resultHeading(page)).toBeFocused({ timeout: 60000 });
  });

  test('two files dropped at once: the first is listed, and the page says the tool takes one file', async ({ page }) => {
    await openPage(page);
    await drop(page, ['restricted.pdf', 'text.pdf']);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('restricted.pdf');
    await expect(page.locator('p:not([role=status])', { hasText: 'This tool takes one file, so text.pdf was not added.' })).toBeVisible();
  });

  test('a file that is not a PDF is refused by name', async ({ page }) => {
    await openPage(page);
    await pick(page, 'not-a-pdf.pdf');
    await expect(page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
  });
});

test.describe('removing the protection', () => {
  test('restricted.pdf, with no password typed: restricted-unprotected.pdf, not encrypted, passing qpdf --check, opening in PDF.js with no password', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pickReady(page, 'restricted.pdf');
    const { download, bytes } = await removeAndDownload(page);
    expect(download.suggestedFilename()).toBe('restricted-unprotected.pdf');
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 3 pages`);
    for (const each of resultNotes) await expect(page.getByText(each)).toBeVisible();
    await expectUnprotected(bytes);
    expect(await pdfjsOpens(bytes)).toBe(3);
    await expect(page.locator('main')).not.toContainText(/unlock/i);
    await noSidewaysScroll(page);
  });

  test('password.pdf: the field with its note and focus in it; a wrong password said and the field kept; open-sesame opens it, focus on the main button; the result has no password and does not hold it', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused({ timeout: 30000 });
    await expect(field).toHaveAttribute('type', 'password');
    await expect(field).toHaveAttribute('autocomplete', 'off');
    await expect(field).not.toHaveAttribute('name', /.*/);
    await expect(field).toHaveAccessibleDescription('The password stays in your browser. It is not sent anywhere.');
    await expect(mainButton(page)).toHaveCount(0);
    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible({ timeout: 30000 });
    await expect(field).toBeFocused();
    await expectNotInMarkup(page, 'not-it');
    await field.fill(open);
    await expectNotInMarkup(page, open);
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused({ timeout: 30000 });
    await expectNotInMarkup(page, open);
    const { download, bytes } = await removeAndDownload(page);
    expect(download.suggestedFilename()).toBe('password-unprotected.pdf');
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 3 pages`);
    await expectUnprotected(bytes);
    expect(await pdfjsOpens(bytes)).toBe(3);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(open);
    await expectNotInMarkup(page, open);
  });

  test('a wrong password still being tried, then the right one: the later answer wins, and the main button stays', async ({ page, context }) => {
    // The wrong try's answer is held back until the right one has been answered, so it arrives last, as it can when
    // the worker reads two tries at once.
    const slowWrong = `export const loads = { read: ['qpdf'], job: ['qpdf'] }; export const inspect = async (file, password) => { if (password === undefined) return { kind: 'needs-password' }; if (password === '${open}') return { kind: 'ready', pages: 3 }; await new Promise((resolve) => setTimeout(resolve, 1500)); return { kind: 'wrong-password' }; };
      export const run = async () => [new Uint8Array([37, 80, 68, 70, 45])];`;
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: slowWrong }));
    await openPage(page);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused({ timeout: 30000 });
    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(rows(page)).toContainText('Trying the password');
    await field.fill(open);
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeVisible({ timeout: 30000 });
    // Well after the wrong try's answer has come back.
    await page.waitForTimeout(2500);
    await expect(mainButton(page)).toBeVisible();
    await expect(page.getByText('That password did not open the file.')).toHaveCount(0);
    await expect(passwordField(page)).toHaveCount(0);
  });

  test('password.pdf opens with its password for permissions, owner-secret, too', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pickReady(page, 'password.pdf', ownerSecret);
    const { bytes } = await removeAndDownload(page);
    await expectUnprotected(bytes);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(ownerSecret);
  });

  test('text.pdf: nothing to remove, with focus on the sentence, its advice, no Download, and Start again emptying the page', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'text.pdf');
    let downloads = 0;
    page.on('download', () => (downloads += 1));
    await mainButton(page).click();
    const heading = page.getByRole('heading', { name: nothingHeading });
    await expect(heading).toBeFocused({ timeout: 30000 });
    await expect(heading).toHaveAccessibleDescription(nothingAdvice);
    await expect(page.getByText(nothingAdvice)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    for (const each of resultNotes) await expect(page.getByText(each)).toHaveCount(0);
    expect(downloads).toBe(0);
    await startAgain(page).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('progress on pages-500.pdf, protected in the test: "Reading the file", then "Writing the unprotected file", with a bar that never goes back', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pickReady(page, asFile('long.pdf', await protectedCopy('pages-500.pdf')), marked);
    await recordProgress(page);
    await mainButton(page).click();
    await expect(resultHeading(page)).toBeFocused({ timeout: 90000 });
    const progress = await recorded(page);
    const lines = [...new Set(progress.map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    expect(lines).toEqual(['Reading the file', 'Writing the unprotected file']);
    const values = progress.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

test.describe('Cancel and failures', () => {
  test('Cancel stops the job and lists the file again, open, with the main button ready and no password asked; the next job runs with it', async ({ page, context }) => {
    const engine = await routeEngine(context, fakeEngine('await new Promise(() => {});'), fakeEngine(givesWithPassword));
    await openPage(page);
    await pickReady(page, 'password.pdf', open);
    await mainButton(page).click();
    await cancel(page).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(rows(page)).toContainText('password.pdf');
    await expect(passwordField(page)).toHaveCount(0);
    await expect(resultHeading(page)).toHaveCount(0);
    await expectNotInMarkup(page, open);
    engine.next();
    await mainButton(page).click();
    await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.locator('astro-island section')).toContainText('password-unprotected.pdf');
  });

  const cases: [string, string, string][] = [
    ['the browser runs out of memory', "throw new RangeError('Array buffer allocation failed');", 'Your browser ran out of memory. Try on a computer.'],
    ['the new file would be far too large', "const error = new Error('x'); error.name = 'OutputLimit'; throw error;", outputLimitSentence],
  ];
  for (const [what, run, sentence] of cases) {
    test(`when ${what}, the page says so; "Go back to your file" lists it open, focus on the main button, and the job runs again without the password typed again`, async ({ page, context }) => {
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
      await expectNotInMarkup(page, open);
      await mainButton(page).click();
      await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
      await expect(page.locator('astro-island section')).toContainText('password-unprotected.pdf');
    });
  }

  test('when the engine cannot be fetched, the page says so', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.abort());
    await openPage(page);
    await pick(page, 'restricted.pdf');
    await expect(failedHeading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });
});

test.describe('how long the password is held', () => {
  test('after a result, "Start again" then the same file asks for its password again', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pickReady(page, 'password.pdf', open);
    await removeAndDownload(page);
    await expectNotInMarkup(page, open);
    await startAgain(page).click();
    await pick(page, 'password.pdf');
    await expect(page.getByLabel('Password for password.pdf')).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('That password did not open the file.')).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
  });

  test('after nothing to remove, "Start again" then a protected file asks for its password', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'text.pdf');
    await mainButton(page).click();
    await expect(page.getByRole('heading', { name: nothingHeading })).toBeFocused({ timeout: 30000 });
    await startAgain(page).click();
    await pick(page, 'password.pdf');
    await expect(page.getByLabel('Password for password.pdf')).toBeFocused({ timeout: 30000 });
  });

  test('leaving the page: straight after pagehide, no file is listed and the HTML does not hold the password', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'password.pdf', open);
    const left = await page.evaluate((password) => {
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      return { rows: document.querySelectorAll('astro-island ol > li').length, html: document.documentElement.outerHTML.includes(password) };
    }, open);
    expect(left).toEqual({ rows: 0, html: false });
  });

  test('a password typed and not yet tried: straight after pagehide, the field is gone or empty', async ({ page }) => {
    await openPage(page);
    await pick(page, 'password.pdf');
    await passwordField(page).fill(open);
    const left = await page.evaluate((password) => {
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      const fields = [...document.querySelectorAll('input[type=password]')] as HTMLInputElement[];
      return { values: fields.map((field) => field.value), html: document.documentElement.outerHTML.includes(password) };
    }, open);
    for (const value of left.values) expect(value).toBe('');
    expect(left.html).toBe(false);
  });

  test('coming back with Back shows no file', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'password.pdf', open);
    await page.goto('/');
    await page.goBack();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('password.pdf');
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    expect(await picker(page).evaluate((input: HTMLInputElement) => input.files?.length ?? 0)).toBe(0);
  });
});

test.describe('problems with the file', () => {
  for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf']) {
    test(`${name} says it is damaged, shows no main button, and offers to choose another`, async ({ page }) => {
      await openPage(page);
      await pick(page, name);
      await expect(page.getByRole('heading', { name: `${name} is damaged and cannot be read.` })).toBeVisible({ timeout: 30000 });
      await expectRepairLink(page);
      await expect(mainButton(page)).toHaveCount(0);
      await page.getByRole('button', { name: 'Choose another file' }).click();
      await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    });
  }

  test('a file encrypted with a certificate is saved in a way this tool cannot read, with the advice, never called damaged', async ({ page }) => {
    await openPage(page);
    await pick(page, asFile('certified.pdf', certificatePdf()));
    await expect(page.getByRole('heading', { name: 'certified.pdf is saved in a way this tool cannot read.' })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('astro-island p:not([role=status])', { hasText: certificateAdvice })).toBeVisible();
    await expect(status(page)).toHaveText(`certified.pdf is saved in a way this tool cannot read. ${certificateAdvice}`);
    await expect(page.getByText(/is damaged/)).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('a file over 100 MB shows the notice, and the main button is ready @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await openPage(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page)).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a file of 120,000 pages shows the notice, the job runs, and nothing blocks the page for more than 100 ms @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await openPage(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(mainButton(page)).toBeFocused({ timeout: 120000 });
    await watchLongTasks(page);
    await mainButton(page).click();
    // The generated file has no encryption, so the job ends with nothing to remove.
    await expect(page.getByRole('heading', { name: nothingHeading })).toBeFocused({ timeout: 120000 });
    expect(await longTasks(page)).toEqual([]);
  });
});

test.describe('the words below the tool', () => {
  test('the title, heading, sentence, steps and questions are in the served page, before any script runs, and "unlock" only in the address', async ({ request }) => {
    const html = await (await request.get('/unlock-pdf')).text();
    expect(html).toContain('<title>Remove a password from a PDF in your browser - PDFkaro</title>');
    expect(html).toContain('content="Remove print and edit restrictions from a PDF, and its password if you know it. The file and the password are not uploaded."');
    for (const words of [
      'Remove a password from a PDF</h1>',
      'Remove print and edit restrictions from a PDF, and its password if you know it. Your file stays on your device. This site does not upload your file or the password.',
      'How to remove a password from a PDF',
      'Press “Remove protection and download”',
      'Is my file uploaded?',
      'The page lets go of the password once the new file is ready, and of both when you press Start again, close the tab, or leave this page.',
      'It does not guess, crack or recover one.',
      'No password is asked for',
      'Remove them only from a file you are allowed to change.',
      'Which password do I type?',
      'You can use your file as it is.',
      'Ask whoever sent it for a copy without this protection.',
      'a digital signature in it will no longer be valid',
      'report-unprotected.pdf',
    ]) {
      expect(html).toContain(words);
    }
    // The word is said nowhere: only in the registry id, sent to the widget, and the address, in the canonical tag,
    // og:url and the structured data (owner, 22 Nov 2026).
    expect(html.replaceAll('unlock-pdf', '').toLowerCase()).not.toContain('unlock');
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** This tool's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts): no option values, drawing step, pdf-lib or fflate. */
const filesAfterPick = () => toolFiles('unlock-pdf').all;
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

/** The page text's lines, each a secret of its own: "Ordinary document, page 1", "Line 1 of plain text …". */
const pageLines = (text: string) => text.split(/\s{2,}|(?<=\.)\s+/).map((line) => line.trim()).filter((line) => line.length > 8);

/** The text of a PDF's first page, read by PDF.js. */
async function firstPageText(bytes: Uint8Array, password?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 });
  try {
    const content = await (await (await task.promise).getPage(1)).getTextContent();
    return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  } finally {
    await task.destroy();
  }
}

test.describe('nothing is uploaded', () => {
  test('qz7report.pdf, protected with "Qz7 pw#%@ Kv4": only the listed files fetched, nothing named, both consoles silent on them, the download free of the password', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const file = await protectedCopy('text.pdf');
    const text = await firstPageText(file, marked);
    expect(text.length).toBeGreaterThan(10);
    // Watched before the page opens, so the tool worker's console is heard from its start.
    const heard = listen(page);
    await openPage(page);
    const seen = watch(context, page);
    await pick(page, asFile('qz7report.pdf', file));
    await expect(passwordField(page)).toBeFocused({ timeout: 30000 });
    await passwordField(page).fill(marked);
    await expectNotInMarkup(page, marked);
    await page.keyboard.press('Enter');
    await waitUntilRead(page, 'qz7report.pdf');
    await expectNotInMarkup(page, marked);
    const { download, bytes } = await removeAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7report-unprotected.pdf');
    await expectUnprotected(bytes);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(marked);

    const secrets = withEncoded(['qz7report.pdf', 'qz7report', marked, 'Qz7', 'pw#%@', 'Kv4', text, ...pageLines(text)]);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = fetchedPaths(seen);
    // The engine was fetched, and nothing of the option values, drawing step, pdf-lib, fflate or another tool.
    for (const name of [/\/unlock-pdf-/, /\/qpdf-/, /\/inspect-/, /\/plain-/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    for (const other of [/\/repair-pdf-/, /\/option-values-/, /\/stamp-/, /\/pages-/, /\/pdflib-/, /\/fflate-/, /\/picture-/, /\/protect-pdf-/, /\/compress-pdf-/, /\/compress-to-target-/, /\/shrink-/, /\/merge-pdf-/, /\/split-pdf-/, /\/sign-pdf-/, /\/grayscale-pdf-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });

  test('restricted.pdf, with no password typed: its name and page text in no request and not in either console', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const text = await firstPageText(new Uint8Array(readFileSync(fixture('restricted.pdf'))));
    expect(text.length).toBeGreaterThan(10);
    const heard = listen(page);
    await openPage(page);
    const seen = watch(context, page);
    await pickReady(page, 'restricted.pdf');
    await removeAndDownload(page);
    const secrets = withEncoded(['restricted.pdf', 'restricted', text, ...pageLines(text)]);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });

  test('rich.pdf, tagged.pdf and form.pdf, protected in the test: no bookmark title, attachment name, document title, hidden text or field value leaves, and the address holds nothing', async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    const secrets = withEncoded([
      'Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment',
      'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE',
      'A tagged file', 'A fillable form', 'Sample text', marked, 'Qz7', 'pw#%@', 'Kv4',
    ]);
    const heard = listen(page);
    await openPage(page);
    const seen = watch(context, page);
    for (const name of ['rich.pdf', 'tagged.pdf', 'form.pdf']) {
      await pickReady(page, asFile(name, await protectedCopy(name)), marked);
      const { bytes } = await removeAndDownload(page);
      await expectUnprotected(bytes);
      expect(Buffer.from(bytes).toString('latin1')).not.toContain(marked);
      await startAgain(page).click();
    }
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });
});
