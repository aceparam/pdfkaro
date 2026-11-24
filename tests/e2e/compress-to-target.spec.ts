// Compress to a target size in a real browser, at a phone width and a desktop width, with the real engine: each of
// the five pages' words, a file under the target and the result over it, a file already at or under the target
// held from the pick, no smaller file, every state, the keyboard, and the promise that nothing about a file, its
// pictures or its password leaves the device. Files over each target are made by target-files.ts.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, type Download, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createQpdf } from '../../src/engines/qpdf';
import { tools } from '../../src/tools/registry';
import { formatSize } from '../../src/widget/format';
import { sizeTargets, type SizeTargetKey } from '../../src/widget/option-values';
import { headersRead, traces, violations, watch, type Seen } from './no-upload';
import { targetFiles, targetPassword } from './target-files';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixture = (name: string) => join(here, '../fixtures', name);
const tool = tools.find((each) => each.id === 'compress-to-target')!;
const noSmaller = 'This file could not be made smaller.';
const noSmallerAdvice = tool.widget!.noSmaller!.advice;
const overAdvice = tool.widget!.sizeTarget!.overAdvice.replaceAll('{target}', '100 KB');
const failed = 'The compression did not finish.';
const engineFile = /\/_astro\/compress-to-target-[A-Za-z0-9_-]{8}\.js$/;

const label = (key: SizeTargetKey) => sizeTargets[key].label;
const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page, key: SizeTargetKey) => page.getByRole('button', { name: `Compress to ${label(key)} and download` });
const rows = (page: Page) => page.locator('astro-island ol > li');
const status = (page: Page) => page.locator('[role=status]').first();
/** The sentence under the main button that says why it waits. */
const whyNot = (page: Page) => page.locator('#compress-to-target-why-not');
const heldText = (name: string, key: SizeTargetKey) => `${name} is already ${label(key)} or smaller, so there is nothing to do here. You can use it as it is.`;
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page, key: SizeTargetKey) {
  await page.goto(`/compress-pdf-to-${key}`);
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

type Given = string | { name: string; mimeType: string; buffer: Buffer };
/** A fixture name, an absolute path of a made file, or a file given whole. */
const asInput = (file: Given) => (typeof file === 'string' ? (file.startsWith('/') ? file : fixture(file)) : file);
async function pick(page: Page, file: Given) {
  await picker(page).setInputFiles(asInput(file));
}
async function pickReady(page: Page, file: Given) {
  await pick(page, file);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
}
const named = (path: string, name: string) => ({ name, mimeType: 'application/pdf', buffer: readFileSync(path) });

async function drop(page: Page, names: string[]) {
  const files = names.map((name) => ({ name, data: readFileSync(fixture(name)).toString('base64') }));
  await page.evaluate((given) => {
    const transfer = new DataTransfer();
    for (const { name, data } of given) transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: 'application/pdf' }));
    for (const type of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

async function compressAndDownload(page: Page, key: SizeTargetKey, heading: string): Promise<{ download: Download; bytes: Uint8Array }> {
  await mainButton(page, key).click();
  await expect(page.getByRole('heading', { name: heading })).toBeFocused({ timeout: 120000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  const done = await download;
  return { download: done, bytes: new Uint8Array(readFileSync((await done.path())!)) };
}

const qpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
async function qpdfOn(bytes: Uint8Array, args: string[]) {
  const made = await qpdf();
  made.write('/r.pdf', bytes);
  return made.call([...args, '/r.pdf']);
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

/** The number of pages PDF.js reads in a file, and the text of its first page. */
async function pdfjsRead(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const doc = await (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    const content = await (await doc.getPage(1)).getTextContent();
    return { pages: doc.numPages, text: content.items.map((item) => ('str' in item ? item.str : '')).join(' ') };
  } finally {
    await doc.loadingTask.destroy();
  }
}

// ---------------------------------------------------------------------------

test.describe('each page', () => {
  for (const page of tool.pages) {
    const key = page.preset!.target as SizeTargetKey;
    test(`${page.slug}: its own title, heading, sentence and picker, and no choice of target`, async ({ page: browser }) => {
      await open(browser, key);
      await expect(browser).toHaveTitle(page.title);
      await expect(browser.getByRole('heading', { level: 1 })).toHaveText(page.heading);
      await expect(browser.getByText(page.sentence)).toBeVisible();
      await expect(browser.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
      await expect(browser.getByRole('radio')).toHaveCount(0);
      await expect(browser.getByRole('textbox')).toHaveCount(0);
      // The text below the tool is in the served page.
      await expect(browser.getByRole('heading', { level: 2 }).first()).toBeVisible();
      await noSidewaysScroll(browser);
    });
  }

  test('the text below the tool is in the served HTML, with scripts off', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      for (const each of tool.pages) {
        await page.goto(`/${each.slug}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(each.heading);
        await expect(page.getByText(each.sentence)).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });
});

test.describe('choosing a file', () => {
  test('"Getting ready" first; then one row with its first page, pages and size; the main button names the size and has focus', async ({ page }) => {
    await open(page, '200kb');
    let release: () => void = () => {};
    const held = new Promise<void>((done) => (release = done));
    await page.route(engineFile, async (route) => {
      await held;
      await route.continue();
    });
    await pick(page, 'compress-scans.pdf');
    await expect(rows(page)).toContainText('compress-scans.pdf');
    await expect(rows(page)).toContainText('Getting ready');
    release();
    await expect(rows(page).filter({ hasText: 'Getting ready' })).toHaveCount(0, { timeout: 30000 });
    const size = formatSize(readFileSync(fixture('compress-scans.pdf')).length);
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(mainButton(page, '200kb')).toBeFocused();
    await expect(mainButton(page, '200kb')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(status(page)).toHaveText(`compress-scans.pdf, 3 pages, ${size}.`);
    await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('two files dropped at once: the first is listed, and the page says the tool takes one file', async ({ page }) => {
    await open(page, '100kb');
    await drop(page, ['compress-scans.pdf', 'text.pdf']);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('compress-scans.pdf');
    await expect(page.locator('p:not([role=status])', { hasText: 'This tool takes one file, so text.pdf was not added.' })).toBeVisible();
  });

  test('a file that is not a PDF is refused by name', async ({ page }) => {
    await open(page, '100kb');
    await pick(page, 'not-a-pdf.pdf');
    await expect(page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });
});

test.describe('a file already at or under the target', () => {
  test('text.pdf on the 100 KB page: held, its sentence tied to the unavailable button and said with the row', async ({ page }) => {
    await open(page, '100kb');
    await pickReady(page, 'text.pdf');
    const sentence = heldText('text.pdf', '100kb');
    const button = mainButton(page, '100kb');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription(sentence);
    await expect(whyNot(page)).toHaveText(sentence);
    await expect(status(page)).toContainText(sentence);
    // Pressing it starts no job.
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('p[class*=progressLine]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /Your file/ })).toHaveCount(0);
    // Another file, over the target: the sentence goes and the button works.
    await pickReady(page, 'compress-scans.pdf');
    await expect(whyNot(page)).toHaveCount(0);
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await noSidewaysScroll(page);
  });

  test('a protected file under the target is held with no password asked', async ({ page }) => {
    await open(page, '200kb');
    await pick(page, 'password.pdf');
    await expect(whyNot(page)).toHaveText(heldText('password.pdf', '200kb'), { timeout: 30000 });
    await expect(page.getByLabel(/^Password for /)).toHaveCount(0);
    await expect(rows(page)).not.toContainText('Needs a password');
    await expect(mainButton(page, '200kb')).toHaveAttribute('aria-disabled', 'true');
  });

  test('a damaged file under the target shows the damaged notice alone', async ({ page }) => {
    await open(page, '200kb');
    await pick(page, 'damaged-xref.pdf');
    await expect(page.getByRole('heading', { name: 'damaged-xref.pdf is damaged and cannot be read.' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/is already 200 KB or smaller/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
  });

  test('a file name with markup is shown as text', async ({ page }) => {
    await open(page, '100kb');
    await pickReady(page, named(fixture('text.pdf'), '<b>x</b>.pdf'));
    await expect(whyNot(page)).toHaveText(heldText('<b>x</b>.pdf', '100kb'));
    await expect(page.locator('astro-island b')).toHaveCount(0);
  });
});

test.describe('compressing', () => {
  test('the 200 KB page: the scans from pick to Download, "Picture N of M", a bar that never goes back, and a file of at most 200,000 bytes', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, '200kb');
    await pickReady(page, 'compress-scans.pdf');
    await recordProgress(page);
    const { download, bytes } = await compressAndDownload(page, '200kb', 'Your file is now 200 KB or smaller');
    const before = readFileSync(fixture('compress-scans.pdf')).length;
    expect(download.suggestedFilename()).toBe('compress-scans-compressed.pdf');
    expect(bytes.length).toBeLessThanOrEqual(200_000);
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, was ${formatSize(before)}, 3 pages`);
    for (const note of tool.widget!.resultNotes) await expect(page.getByText(note)).toBeVisible();
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, ['--show-npages'])).out.trim()).toBe('3');
    expect((await pdfjsRead(bytes)).pages).toBe(3);
    const progress = await recorded(page);
    const lines = [...new Set(progress.map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    expect(lines).toEqual(['Reading the file', 'Picture 1 of 3', 'Picture 2 of 3', 'Picture 3 of 3', 'Writing the compressed file']);
    const values = progress.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const step of progress.filter((each) => each.line === 'Writing the compressed file')) expect(step.value).toBeLessThan(100);
    await noSidewaysScroll(page);
  });

  test('the 100 KB page: a file still over at the floor, with its heading, sentence, advice and Download, the size the same in the sentence and the line', async ({ page }) => {
    test.setTimeout(180_000);
    const files = await targetFiles('100kb');
    const before = readFileSync(files.over).length;
    await open(page, '100kb');
    await pickReady(page, named(files.over, 'scans.pdf'));
    const { download, bytes } = await compressAndDownload(page, '100kb', 'Your file is still over 100 KB');
    expect(download.suggestedFilename()).toBe('scans-compressed.pdf');
    expect(bytes.length).toBeGreaterThan(100_000);
    const heading = page.getByRole('heading', { name: 'Your file is still over 100 KB' });
    const sentence = page.locator('astro-island section p').filter({ hasText: /^The smallest file this tool could make is / });
    await expect(sentence).toHaveCount(1);
    const said = /^The smallest file this tool could make is (.+), which is over 100 KB\.$/.exec((await sentence.textContent())!)![1]!;
    await expect(heading).toHaveAccessibleDescription(`The smallest file this tool could make is ${said}, which is over 100 KB.`);
    await expect(page.getByText(overAdvice)).toBeVisible();
    const line = (await page.locator('astro-island section .muted').textContent())!;
    expect(line.startsWith(`${said}, was ${formatSize(before)}`)).toBe(true);
    expect(said).toMatch(/KB|bytes/);
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    await noSidewaysScroll(page);
  });

  test('a packed text-only file over 100 KB: "could not be made smaller", its advice, Start again and no Download, with focus on the heading', async ({ page }) => {
    test.setTimeout(120_000);
    const files = await targetFiles('100kb');
    await open(page, '100kb');
    await pickReady(page, named(files.packed, 'letters.pdf'));
    await mainButton(page, '100kb').click();
    const heading = page.getByRole('heading', { name: noSmaller });
    await expect(heading).toBeFocused({ timeout: 60000 });
    await expect(heading).toHaveAccessibleDescription(noSmallerAdvice);
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
  });

  test('done by keyboard alone: choose a file, press the main button, reach Download and Start again', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, '500kb');
    await picker(page).focus();
    await picker(page).setInputFiles(fixture('compress-scans.pdf'));
    await expect(rows(page).filter({ hasText: 'Getting ready' })).toHaveCount(0, { timeout: 30000 });
    await expect(mainButton(page, '500kb')).toBeFocused({ timeout: 30000 });
    await expect(mainButton(page, '500kb')).not.toHaveAttribute('aria-disabled', 'true');
    // A visible focus outline on the main button.
    expect(await mainButton(page, '500kb').evaluate((button) => getComputedStyle(button).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', { name: 'Your file is now 500 KB or smaller' });
    await expect(heading).toBeFocused({ timeout: 90000 });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Download' })).toBeFocused();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await download).suggestedFilename()).toBe('compress-scans-compressed.pdf');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Start again' })).toBeFocused();
  });
});

test.describe('problems with the file', () => {
  test('a protected file over the target asks for its password; a wrong one says so; the right one opens it; the result keeps the password', async ({ page }) => {
    test.setTimeout(120_000);
    const files = await targetFiles('100kb');
    await open(page, '100kb');
    await pick(page, named(files.protectedFits, 'locked.pdf'));
    const field = page.getByLabel('Password for locked.pdf');
    await expect(field).toBeFocused({ timeout: 30000 });
    await expect(page.getByText(/stays in (this|your) browser/).first()).toBeVisible();
    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await field.fill(targetPassword);
    await page.keyboard.press('Enter');
    await expect(mainButton(page, '100kb')).toBeFocused({ timeout: 30000 });
    const { bytes } = await compressAndDownload(page, '100kb', 'Your file is now 100 KB or smaller');
    expect(bytes.length).toBeLessThanOrEqual(100_000);
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(2);
    expect((await qpdfOn(bytes, [`--password=${targetPassword}`, '--check'])).code).toBe(0);
  });

  test('Cancel during the job lists the file again, with no password asked again', async ({ page }) => {
    test.setTimeout(120_000);
    // A protected copy of the file with a 1 GB attachment, whose write takes long enough to cancel.
    const made = await qpdf();
    made.write('/in.pdf', readFileSync(fixture('compress-bomb-attachment.pdf')));
    made.call(['/in.pdf', '--encrypt', `--user-password=${targetPassword}`, `--owner-password=${targetPassword}`, '--bits=256', '--', '/out.pdf']);
    const locked = Buffer.from(made.read('/out.pdf'));
    await open(page, '200kb');
    await pick(page, { name: 'big.pdf', mimeType: 'application/pdf', buffer: locked });
    await page.getByLabel('Password for big.pdf').fill(targetPassword);
    await page.keyboard.press('Enter');
    await expect(mainButton(page, '200kb')).toBeFocused({ timeout: 30000 });
    await mainButton(page, '200kb').click();
    await expect(page.locator('p[class*=progressLine]')).toHaveText(/Reading the file|Writing the compressed file/, { timeout: 30000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page, '200kb')).toBeFocused();
    await expect(rows(page)).toContainText('big.pdf');
    await expect(page.getByLabel(/^Password for /)).toHaveCount(0);
    await expect(mainButton(page, '200kb')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('when the browser runs out of memory, the page says so and what to try, and "Go back to your file" lists it again', async ({ page, context }) => {
    // An engine that reads the file as the real one does, then runs out of memory as a phone might.
    await context.route(engineFile, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: "export const loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }; export const inspect = async () => ({ kind: 'ready', pages: 3 }); export const run = async () => { throw new RangeError('Array buffer allocation failed'); };",
      }),
    );
    await open(page, '100kb');
    await pickReady(page, 'compress-scans.pdf');
    await mainButton(page, '100kb').click();
    await expect(page.getByRole('heading', { name: failed })).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('Your browser ran out of memory. Try on a computer, or split the file first and compress the parts.')).toBeVisible();
    await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
    await expect(rows(page)).toContainText('compress-scans.pdf');
    await expect(mainButton(page, '100kb')).toBeFocused();
  });

  test('when the engine fails, the page says the compression did not finish, with one thing to try', async ({ page, context }) => {
    await context.route(engineFile, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: "export const loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }; export const inspect = async () => ({ kind: 'ready', pages: 3 }); export const run = async () => { throw new Error('The target size was not one this tool knows.'); };",
      }),
    );
    await open(page, '200kb');
    await pickReady(page, 'compress-scans.pdf');
    await mainButton(page, '200kb').click();
    await expect(page.getByRole('heading', { name: failed })).toBeFocused({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Go back to your file', exact: true })).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('when the engine cannot be fetched, the page says so', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.abort());
    await open(page, '100kb');
    await pick(page, 'compress-scans.pdf');
    await expect(page.getByRole('heading', { name: failed })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });

  test('a file over 100 MB shows the notice, and the main button works @desktop', async ({ page }) => {
    test.setTimeout(180_000);
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await open(page, '2mb');
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 90000 });
    await expect(page.getByText('The job may be slow, and a phone may run out of memory. You can still go ahead.')).toBeVisible();
    await expect(mainButton(page, '2mb')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a file of 120,000 pages shows the notice, and the main button works @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await open(page, '1mb');
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    if (readFileSync(path).length > 1_000_000) await expect(mainButton(page, '1mb')).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** This tool's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts). */
const filesAfterPick = () => toolFiles('compress-to-target').all;
const fetchedPaths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];

async function watchedRun(page: Page, given: Given, typed?: string) {
  const consoleText: string[] = [];
  page.on('console', (message) => consoleText.push(message.text()));
  page.on('worker', (worker) => worker.on('console', (message) => consoleText.push(message.text())));
  await pick(page, given);
  if (typed) {
    await page.getByLabel(/^Password for /).fill(typed);
    await page.keyboard.press('Enter');
  }
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
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

/** A secret and its URL-encoded form. */
const withEncoded = (secrets: string[]) => [...new Set(secrets.flatMap((secret) => [secret, encodeURIComponent(secret)]))];
const fileSecrets = ['SECRET-PAGE-TEXT-target', 'SECRET-FIELD-NAME', 'SECRET-FIELD-VALUE', 'SECRET-LINK', 'SECRET-TITLE-target', 'SECRET-CAMERA-MAKE', 'SECRET-CAMERA-MODEL', 'SECRET-GPS-PLACE'];

test.describe('nothing is uploaded', () => {
  test('the 200 KB page: a protected photo named qz7report.pdf, with its password, compressed under the target and downloaded', async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    const files = await targetFiles('200kb');
    expect(readFileSync(files.protectedFits).length).toBeGreaterThan(200_000);
    await open(page, '200kb');
    const seen = watch(context, page);
    const consoleText = await watchedRun(page, named(files.protectedFits, 'qz7report.pdf'), targetPassword);
    const { download } = await compressAndDownload(page, '200kb', 'Your file is now 200 KB or smaller');
    expect(download.suggestedFilename()).toBe('qz7report-compressed.pdf');
    const secrets = withEncoded(['qz7report.pdf', 'qz7report', targetPassword, 'open-', 'sesame', ...fileSecrets]);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = fetchedPaths(seen);
    for (const name of [engineFile, /\/shrink-/, /\/fflate-/, /\/plain-/, /\/inspect-/, /\/option-values-/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    for (const other of [/\/pdflib-/, /\/pages-/, /\/stamp-/, /\/compress-pdf-/, /\/crop-pdf-/, /\/resize-pdf-/, /\/protect-pdf-/, /\/merge-pdf-/, /\/picture-thumbnail-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }
    await expectNothingHeld(page, context, secrets, consoleText);
  });

  test('the 100 KB page: an unprotected file through the floor path to a result over the target, downloaded', async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    const files = await targetFiles('100kb');
    await open(page, '100kb');
    const seen = watch(context, page);
    const consoleText = await watchedRun(page, named(files.over, 'qz7floor.pdf'));
    const { download } = await compressAndDownload(page, '100kb', 'Your file is still over 100 KB');
    expect(download.suggestedFilename()).toBe('qz7floor-compressed.pdf');
    const secrets = withEncoded(['qz7floor.pdf', 'qz7floor', 'SECRET-ATTACHMENT.bin', ...fileSecrets]);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, consoleText);
  });
});

test('the made files are over their targets, with the name of each kind', async () => {
  for (const key of Object.keys(sizeTargets) as SizeTargetKey[]) {
    const files = await targetFiles(key);
    for (const path of [files.fits, files.protectedFits, files.over, files.packed, files.failing]) {
      expect(readFileSync(path).length, basename(path)).toBeGreaterThan(sizeTargets[key].bytes);
    }
  }
});
