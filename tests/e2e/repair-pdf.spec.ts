// Repair PDF in a real browser, at a phone width and a desktop width, with the real engine: choosing a file,
// repairing damaged files (checked with qpdf and PDF.js), a sound file with nothing to repair, a damaged protected file,
// a certificate-encrypted file, a file with no pages, progress with the check, Cancel and failures (too damaged
// among them), the 100 MB notice, the keyboard and the status line, the guards reaching the bundled pdf-lib, the
// words below the tool, and the promise that nothing about a file leaves the device or reaches storage, the title,
// the address or either console, on every route.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFArray, PDFDocument, PDFName, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { type BrowserContext, type ConsoleMessage, type Download, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createQpdf } from '../../src/engines/qpdf';
import { formatSize, progressFraction } from '../../src/widget/format';
import { headersRead, traces, violations, watch } from './no-upload';
import { toolFiles } from './tool-files';
import { bytesOf, damagedCopy, deflated, handPdf, hostile, latin1, onePage, streamBody, zeroBomb } from '../unit/repair-helpers';
import { certificatePdf } from '../unit/unlock-helpers';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixture = (name: string) => join(here, '../fixtures', name);
const open = 'open-sesame';
/** The marked password of the file protected in the no-upload test. */
const marked = 'Qz7 pw#%@ Kv4';
const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';
const noneHeading = 'This file has no damage this tool can find.';
const noneAdvice = 'No new file was made. You can use your file as it is. If it does not open in one program, try opening it in another.';
const tooDamaged = 'This file is too damaged to repair. If you have another copy of the file, try that one.';
const damagedAdvice = 'No pages could be found in it. If you have another copy of the file, try that one.';
const unsupportedAdvice = 'It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection.';
const resultNotes = [
  "The new file holds every page and part that could be read. Anything lost in the damage, such as missing pages, text or pictures, cannot be brought back. If the file's last save was lost, parts of an earlier version may show. Check the new file before you rely on it.",
  "Links, form fields, bookmarks, attached files and the document's details that could be read are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them.",
];
const pageTooLarge = 'Page 14 has too much drawing on it to repair here. Delete that page, or split the file, and repair the rest.';

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Repair and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const status = (page: Page) => page.locator('[role=status]').first();
const passwordField = (page: Page) => page.getByLabel(/^Password for /);
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your repaired file is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The file was not repaired.' });
const cancel = (page: Page) => page.getByRole('button', { name: 'Cancel' });
const goBack = (page: Page) => page.getByRole('button', { name: 'Go back to your file', exact: true });
const startAgain = (page: Page) => page.getByRole('button', { name: 'Start again' });
const pickerLabel = (page: Page) => page.locator('label', { hasText: 'Choose a PDF file' });
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function openPage(page: Page) {
  await page.goto('/repair-pdf');
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
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 60000 });
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
async function repairAndDownload(page: Page): Promise<{ download: Download; bytes: Uint8Array }> {
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

/** Not encrypted, passing qpdf's check with no password, with this many pages. */
async function expectRepaired(bytes: Uint8Array, pages: number) {
  expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
  const { out } = await qpdfOn(bytes, ['--json=2', '--json-key=encrypt']);
  expect((JSON.parse(out) as { encrypt: { encrypted: boolean } }).encrypt.encrypted).toBe(false);
  expect(Number((await qpdfOn(bytes, ['--show-npages'])).out.trim())).toBe(pages);
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

const engineFile = /\/_astro\/repair-pdf-[A-Za-z0-9_-]{8}\.js$/;
/**
 * An engine in place of the real one: it reads password.pdf's way (needs a password, opened by open-sesame, wrong
 * otherwise; any other file is ready) and then does what `run` says, with `options` the job's options.
 */
const fakeEngine = (run: string) =>
  `export const loads = { read: ['qpdf', 'pdflib'], job: ['qpdf', 'pdflib', 'fflate'] }; export const inspect = async (file, password) => file.length !== ${readFileSync(fixture('password.pdf')).length} ? { kind: 'ready', pages: 3 } : password === undefined ? { kind: 'needs-password' } : password === '${open}' ? { kind: 'ready', pages: 3 } : { kind: 'wrong-password' };
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
  test('the page: its words and the picker alone; "Getting ready" first; damaged-xref.pdf listed with 3 pages and its size, no damaged notice, focus on the main button and the status line said once', async ({ page }) => {
    await openPage(page);
    await expect(page).toHaveTitle('Repair a damaged PDF in your browser - PDFkaro');
    await expect(page.getByRole('heading', { level: 1, name: 'Repair a damaged PDF' })).toBeVisible();
    await expect(page.getByText('Recover what can still be read from a damaged PDF. Your file stays on your device.')).toBeVisible();
    await expect(pickerLabel(page)).toBeVisible();
    await expect(mainButton(page)).toHaveCount(0);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(engineFile, async (route) => {
      await held;
      await route.continue();
    });
    await pick(page, 'damaged-xref.pdf');
    await expect(rows(page)).toContainText('Getting ready');
    await recordStatus(page);
    release();
    await waitUntilRead(page, 'damaged-xref.pdf');
    const size = formatSize(readFileSync(fixture('damaged-xref.pdf')).length);
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(page.getByRole('heading', { name: /is damaged and cannot be read/ })).toHaveCount(0);
    await expect(status(page)).toHaveText(`damaged-xref.pdf, 3 pages, ${size}.`);
    expect((await saidInStatus(page)).filter((said) => said === `damaged-xref.pdf, 3 pages, ${size}.`)).toHaveLength(1);
    await expect(mainButton(page)).toBeFocused();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await noSidewaysScroll(page);
  });

  test('two files dropped at once: the first is listed, and the page says the tool takes one file', async ({ page }) => {
    await openPage(page);
    await drop(page, ['damaged-xref.pdf', 'rich.pdf']);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('damaged-xref.pdf');
    await expect(page.locator('p:not([role=status])', { hasText: 'This tool takes one file, so rich.pdf was not added.' })).toBeVisible();
  });

  test('a file that is not a PDF is refused by name', async ({ page }) => {
    await openPage(page);
    await pick(page, 'not-a-pdf.pdf');
    await expect(page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
  });

  test('keyboard only: the picker by keyboard, Tab to the main button, Enter repairs, focus reaches the result, then Download', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'damaged-xref.pdf');
    await expect(mainButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 60000 });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Download' })).toBeFocused();
    expect(await page.getByRole('link', { name: 'Download' }).evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  });
});

test.describe('repairing', () => {
  test('damaged-xref.pdf: "Reading the file", a bar that never goes back, 55 then 95 during the check; the notes; damaged-xref-repaired.pdf with its 3 pages and text', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pickReady(page, 'damaged-xref.pdf');
    await recordProgress(page);
    const { download, bytes } = await repairAndDownload(page);
    expect(download.suggestedFilename()).toBe('damaged-xref-repaired.pdf');
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 3 pages`);
    for (const each of resultNotes) await expect(page.getByText(each)).toBeVisible();
    const steps = await recorded(page);
    const lines = [...new Set(steps.map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    for (const line of lines) expect(line).toMatch(/^(Reading the file|Writing the repaired file)$/);
    const values = steps.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    // The bar as the page shows it: writing fills 20 to 100, so the writes' 50 shows as 60 and the check's 55 as 64. The
    // engine sends 95 when the check ends and 100 at once after it, which the page may draw as one step (the unit test
    // pins the order 55, 95, 100), and the result can replace the bar first: after 64 comes 96, 100 or nothing.
    const shown = (percent: number) => Math.round(progressFraction({ stage: 'writing', percent }) * 100);
    expect(values.filter((value) => value > shown(0) && value <= shown(50)).length).toBeGreaterThan(0);
    expect(values).toContain(shown(55));
    for (const value of values.slice(values.indexOf(shown(55)) + 1)) expect([shown(95), 100]).toContain(value);
    await expectRepaired(bytes, 3);
    expect(await pageTexts(bytes)).toEqual(await pageTexts(new Uint8Array(readFileSync(fixture('text.pdf')))));
    await noSidewaysScroll(page);
  });

  test('damaged-cut.pdf: listed with 198 pages and repaired into 198', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pickReady(page, 'damaged-cut.pdf');
    await expect(rows(page)).toContainText('198 pages');
    const { download, bytes } = await repairAndDownload(page);
    expect(download.suggestedFilename()).toBe('damaged-cut-repaired.pdf');
    await expectRepaired(bytes, 198);
  });

  test('text.pdf: no damage found, with focus on the heading, its advice, no Download, no notes, and Start again emptying the page', async ({ page }) => {
    await openPage(page);
    await pickReady(page, 'text.pdf');
    let downloads = 0;
    page.on('download', () => (downloads += 1));
    await mainButton(page).click();
    const heading = page.getByRole('heading', { name: noneHeading });
    await expect(heading).toBeFocused({ timeout: 30000 });
    await expect(heading).toHaveAccessibleDescription(noneAdvice);
    await expect(page.getByText(noneAdvice)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    for (const each of resultNotes) await expect(page.getByText(each)).toHaveCount(0);
    expect(downloads).toBe(0);
    await startAgain(page).click();
    await expect(pickerLabel(page)).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('a damaged copy of password.pdf: the field with its note and focus in it; a wrong password said, the field kept; open-sesame reads 3 pages; the result has no password', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await pick(page, asFile('password.pdf', damagedCopy(readFileSync(fixture('password.pdf')))));
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused({ timeout: 30000 });
    await expect(field).toHaveAccessibleDescription('The password stays in your browser. It is not sent anywhere.');
    await expect(mainButton(page)).toHaveCount(0);
    await field.fill('nope');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible({ timeout: 30000 });
    await expect(field).toBeFocused();
    await field.fill(open);
    await page.keyboard.press('Enter');
    await expect(mainButton(page)).toBeFocused({ timeout: 30000 });
    await expect(rows(page)).toContainText('3 pages');
    const { download, bytes } = await repairAndDownload(page);
    expect(download.suggestedFilename()).toBe('password-repaired.pdf');
    await expectRepaired(bytes, 3);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(open);
  });

  test('a certificate-encrypted file is one this tool cannot read, with Remove a password’s advice', async ({ page }) => {
    await openPage(page);
    await pick(page, asFile('sealed.pdf', certificatePdf()));
    await expect(page.getByRole('heading', { name: 'sealed.pdf is saved in a way this tool cannot read.' })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('p:not([role=status])', { hasText: unsupportedAdvice })).toBeVisible();
    await expect(mainButton(page)).toHaveCount(0);
  });

  test('a file with no pages: the damaged notice with its advice, "Choose another file", no main button and no link to Repair PDF', async ({ page }) => {
    await openPage(page);
    await pick(page, asFile('empty.pdf', bytesOf('%PDF-1.7\n1 0 obj\n<< /A 1 >>\nendobj\n')));
    await expect(page.getByRole('heading', { name: 'empty.pdf is damaged and cannot be read.' })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('p:not([role=status])', { hasText: damagedAdvice })).toBeVisible();
    await expect(status(page)).toHaveText(`empty.pdf is damaged and cannot be read. ${damagedAdvice}`);
    await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(pickerLabel(page)).toBeVisible();
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
    await expect(page.locator('astro-island section')).toContainText('password-repaired.pdf');
  });

  const cases: [string, string, string][] = [
    ['the browser runs out of memory', "throw new RangeError('Array buffer allocation failed');", 'Your browser ran out of memory. Try on a computer.'],
    ['the new file would be far too large', "const error = new Error('x'); error.name = 'OutputLimit'; throw error;", outputLimitSentence],
    ['page 14 has too much drawing on it', "const error = new Error('x'); error.name = 'PageTooLarge'; error.page = 14; throw error;", pageTooLarge],
  ];
  for (const [what, run, sentence] of cases) {
    test(`when ${what}, the page says so under "The file was not repaired."; "Go back to your file" lists it, focus on the main button, and the job runs again without the password typed again`, async ({ page, context }) => {
      const engine = await routeEngine(context, fakeEngine(run), fakeEngine(givesWithPassword));
      await openPage(page);
      await pickReady(page, 'password.pdf', open);
      await mainButton(page).click();
      await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
      await expect(page.getByText(sentence)).toBeVisible();
      await noSidewaysScroll(page);
      engine.next();
      await goBack(page).click();
      await expect(rows(page)).toContainText('password.pdf');
      await expect(passwordField(page)).toHaveCount(0);
      await expect(mainButton(page)).toBeFocused();
      await mainButton(page).click();
      await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
    });
  }

  test('when the file is too damaged to repair, the page says so, gives no file, and "Choose another file" removes it and focuses the picker', async ({ page, context }) => {
    await routeEngine(context, fakeEngine("const error = new Error('x'); error.name = 'RepairFailed'; throw error;"), fakeEngine(givesWithPassword));
    await openPage(page);
    await pickReady(page, 'damaged-xref.pdf');
    await mainButton(page).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText(tooDamaged)).toBeVisible();
    await expect(goBack(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(picker(page)).toBeFocused();
    await expect(rows(page)).toHaveCount(0);
    await noSidewaysScroll(page);
  });

  test('when the engine cannot be fetched, the page says so, and "Go back to your file" is offered', async ({ page, context }) => {
    let blocked = true;
    await context.route(engineFile, (route) => (blocked ? route.abort() : route.continue()));
    await openPage(page);
    await pick(page, 'damaged-xref.pdf');
    await expect(failedHeading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
    blocked = false;
    await expect(goBack(page)).toBeVisible();
  });
});

test.describe('large files', () => {
  test('a 110 MB file whose startxref is wrong shows the notice, and the main button is ready @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    const damaged = join(tmpdir(), 'pdfkaro-e2e-large-damaged.pdf');
    if (!existsSync(damaged)) writeFileSync(damaged, damagedCopy(new Uint8Array(readFileSync(large))));
    await openPage(page);
    await picker(page).setInputFiles(damaged);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 120000 });
    await expect(mainButton(page)).toBeVisible({ timeout: 120000 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('the guards in the built worker', () => {
  test('the bundled pdf-lib is guarded: a 2 GB object-stream bomb and a stream inside an object stream stop with the shared words; a cross-reference stream bomb reads at once @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const bomb = await zeroBomb(2048 * 1024 * 1024);
    const bombFile = bytesOf(handPdf([...onePage(streamBody('')), streamBody(bomb, '/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode')], { table: false }));
    await openPage(page);
    let started = Date.now();
    await pick(page, asFile('bomb.pdf', bombFile));
    await expect(failedHeading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(outputLimitSentence)).toBeVisible();
    expect(Date.now() - started).toBeLessThan(30000);
    await openPage(page);
    started = Date.now();
    await pick(page, asFile('copies.pdf', hostile.objectStreamCopies(20_000, 1024 * 1024)));
    await expect(failedHeading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(outputLimitSentence)).toBeVisible();
    expect(Date.now() - started).toBeLessThan(30000);
    await openPage(page);
    started = Date.now();
    await pickReady(page, asFile('xref.pdf', hostile.xrefStreamBomb()));
    await expect(rows(page)).toContainText('1 page');
    expect(Date.now() - started).toBeLessThan(30000);
  });
});

test.describe('the words below the tool', () => {
  test('the title, description, heading, sentence, steps and questions are in the served page, before any script runs, as a draft with no promise that every file can be repaired', async ({ request }) => {
    const html = await (await request.get('/repair-pdf')).text();
    expect(html).toContain('<title>Repair a damaged PDF in your browser - PDFkaro</title>');
    expect(html).toContain('content="Recover what can still be read from a damaged PDF. The file stays on your device and is not uploaded. You get it in a new file."');
    for (const words of [
      'Repair a damaged PDF</h1>',
      'How to repair a damaged PDF',
      'Press “Repair and download”',
      'What kinds of damage can it fix?',
      'It cannot fix every file.',
      'Why are some pages missing or blank?',
      'Why does some of the file look older?',
      'Why does the new file have no password?',
      'My file still does not open in one program',
      'Is my file uploaded?',
    ]) {
      expect(html).toContain(words);
    }
    const below = html.slice(html.indexOf('How to repair a damaged PDF'), html.indexOf('Related tools</h2>'));
    const words = below.replace(/<[^>]+>/g, ' ').split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
    expect(words.length).toBeGreaterThanOrEqual(250);
    expect(words.length).toBeLessThanOrEqual(500);
    expect(below).not.toMatch(/!|100%|unlock|every file can be repaired|any file can be repaired/i);
  });

  test('the home page and the hub list Repair PDF right after Grayscale PDF', async ({ request }) => {
    for (const path of ['/', '/make-smaller-and-fix']) {
      const html = await (await request.get(path)).text();
      const grey = html.indexOf('>Grayscale PDF<');
      const repair = html.indexOf('>Repair PDF<');
      expect(grey, path).toBeGreaterThan(0);
      expect(repair, path).toBeGreaterThan(grey);
      // Nothing listed between the two.
      expect(html.slice(grey + '>Grayscale PDF<'.length, repair).match(/<a /g) ?? []).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** This tool's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts). */
const filesAfterPick = () => toolFiles('repair-pdf').all;

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
 * A file made here with SECRET- strings in its text, a link to https://example.invalid/SECRET-uri, a named destination
 * SECRET-dest, a bookmark SECRET-bookmark and a field filled with SECRET-field, optionally protected with the marked password.
 */
async function markedFile(protect: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 400]);
  page.drawText('SECRET-text', { x: 40, y: 340, size: 18, font });
  const field = doc.getForm().createTextField('name');
  field.addToPage(page, { x: 40, y: 200, width: 200, height: 20 });
  field.setText('SECRET-field');
  const context = doc.context;
  const link = context.register(context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 300, 200, 320], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of('https://example.invalid/SECRET-uri') } }));
  page.node.lookup(PDFName.of('Annots'), PDFArray).push(link);
  const destination = context.obj([page.ref, PDFName.of('Fit')]);
  doc.catalog.set(PDFName.of('Names'), context.obj({ Dests: context.obj({ Names: [PDFString.of('SECRET-dest'), destination] }) }));
  const outlines = context.nextRef();
  const item = context.register(context.obj({ Title: PDFString.of('SECRET-bookmark'), Parent: outlines, Dest: destination }));
  context.assign(outlines, context.obj({ Type: 'Outlines', First: item, Last: item, Count: 1 }));
  doc.catalog.set(PDFName.of('Outlines'), outlines);
  const plain = await doc.save({ useObjectStreams: false });
  if (!protect) return plain;
  const tool = await qpdf();
  tool.write('/in.pdf', plain);
  const made = tool.call(['/in.pdf', '--object-streams=disable', '--encrypt', `--user-password=${marked}`, `--owner-password=${marked}`, '--bits=256', '--', '/out.pdf']);
  expect(made.code).toBe(0);
  return tool.read('/out.pdf');
}

/** The marked file with its drawing's compressed data damaged part way, so the sweep keeps what still unpacks. */
async function markedWithDamagedDrawing(): Promise<Uint8Array> {
  const drawing = `BT /F1 12 Tf 40 300 Td (SECRET-drawn) Tj ET\n${Array.from({ length: 3000 }, (_, at) => `${at % 300} ${(at * 7) % 300} m ${(at * 3) % 300} ${(at * 11) % 300} l S`).join('\n')}`;
  const packed = deflated(drawing, 1);
  const broken = `${packed.slice(0, Math.floor(packed.length * 0.7))}${'ÿ'.repeat(40)}${packed.slice(Math.floor(packed.length * 0.7) + 40)}`;
  return bytesOf(handPdf(onePage(streamBody(broken, '/Filter /FlateDecode'), ['<< /Title (SECRET-title) >>']), { trailer: '/Info 5 0 R' }));
}

test.describe('nothing is uploaded', () => {
  test('qz7report.pdf, damaged and protected with "Qz7 pw#%@ Kv4", SECRET- strings in its text, a link, a destination, a bookmark and a field: the pdf-lib route fetches only the listed files and names nothing', async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    const file = damagedCopy(await markedFile(true));
    const heard = listen(page);
    await openPage(page);
    const seen = watch(context, page);
    await pick(page, asFile('qz7report.pdf', file));
    await expect(passwordField(page)).toBeFocused({ timeout: 30000 });
    await passwordField(page).fill(marked);
    await page.keyboard.press('Enter');
    await waitUntilRead(page, 'qz7report.pdf');
    const { download, bytes } = await repairAndDownload(page);
    expect(download.suggestedFilename()).toBe('qz7report-repaired.pdf');
    await expectRepaired(bytes, 1);
    expect((await pageTexts(bytes)).join(' ')).toContain('SECRET-text');
    for (const name of ['rich.pdf', 'tagged.pdf', 'form.pdf']) {
      await startAgain(page).click();
      await pickReady(page, asFile(name, damagedCopy(readFileSync(fixture(name)))));
      await repairAndDownload(page);
    }
    const secrets = withEncoded([
      'qz7report.pdf', 'qz7report', marked, 'Qz7', 'pw#%@', 'Kv4', 'SECRET-text', 'SECRET-uri', 'https://example.invalid/SECRET-uri', 'SECRET-dest', 'SECRET-bookmark', 'SECRET-field',
      'Chapter one', 'Chapter two', 'note.txt', 'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE', 'A tagged file', 'A fillable form',
    ]);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];
    for (const name of [/\/repair-pdf-/, /\/qpdf-/, /\/pdflib-/, /\/fflate-/, /\/zlib-/, /\/content-/, /\/inspect-/, /\/plain-/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    for (const other of [/\/stamp-/, /\/option-values-/, /\/picture-[A-Za-z0-9_-]{8}\.js/, /\/shrink-/, /\/pages-[A-Za-z0-9_-]{8}\.js$/, /\/grayscale-pdf-/, /\/crop-pdf-/, /\/merge-pdf-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });

  test('the qpdf route (junk before %PDF-), the sweep (a damaged drawing) and no new file (a sound file): nothing named anywhere', async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    const plain = await markedFile(false);
    const files: [string, Uint8Array, 'done' | 'none'][] = [
      ['qz7junk.pdf', bytesOf(`junk before the header SECRET-junk\n${latin1(plain)}`), 'done'],
      ['qz7swept.pdf', await markedWithDamagedDrawing(), 'done'],
      ['qz7sound.pdf', plain, 'none'],
    ];
    const heard = listen(page);
    await openPage(page);
    const seen = watch(context, page);
    for (const [name, bytes, ending] of files) {
      await pickReady(page, asFile(name, bytes));
      if (ending === 'done') await repairAndDownload(page);
      else {
        await mainButton(page).click();
        await expect(page.getByRole('heading', { name: noneHeading })).toBeFocused({ timeout: 30000 });
      }
      await startAgain(page).click();
    }
    const secrets = withEncoded(['qz7junk', 'qz7swept', 'qz7sound', 'SECRET-junk', 'SECRET-drawn', 'SECRET-title', 'SECRET-text', 'SECRET-uri', 'SECRET-dest', 'SECRET-bookmark', 'SECRET-field']);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });
});

