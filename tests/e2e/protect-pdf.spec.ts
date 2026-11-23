// Protect with a password in a real browser, at a phone width and a desktop width, with the real engine:
// choosing a file, typing the new password twice, protecting a file and checking the download, every state,
// how long the page holds the password, and the promise that nothing about a file, its password or the new
// password leaves the device or reaches the markup, storage, the title, the address or either console.

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
const oldPassword = 'open-sesame';
const typed = 'Kv4 #%@ wq9';
const hint =
  'If you forget this password, no one can open the file or get it back. A short password is easy to guess. Up to 127 characters. Use English letters without accents, numbers, spaces and marks such as @, # and -.';
const note =
  'The password stays in your browser. This site does not send it anywhere. Your browser may offer to save it or to suggest one. A saved password is kept by your browser and may be copied to your browser account.';
const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';
const charactersSentence = 'Some characters cannot be used. Use only the characters listed under the box.';
const mismatchSentence = 'The two passwords are not the same. Type the password again in this box.';
const resultNotes = [
  'The file now opens only with the password you typed. Keep it somewhere safe: if it is forgotten, no one can open the file.',
  'Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
  'If the file you chose had a password or restrictions, the new password replaces them, and the file has no restrictions.',
];

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Protect and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const summary = (page: Page) => page.locator('astro-island p[tabindex="-1"]');
const status = (page: Page) => page.locator('[role=status]').first();
const first = (page: Page) => page.getByLabel('New password', { exact: true });
const again = (page: Page) => page.getByLabel('Type the new password again', { exact: true });
const whyNot = (page: Page) => page.locator('#protect-pdf-why-not');
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your protected file is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The password was not added.' });
const anotherFile = (page: Page) => page.getByLabel('Choose another file');
const cancel = (page: Page) => page.getByRole('button', { name: 'Cancel' });
const goBack = (page: Page) => page.getByRole('button', { name: 'Go back to your file', exact: true });
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page) {
  await page.goto('/protect-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

type Given = string | { name: string; mimeType: string; buffer: Buffer };
async function pick(page: Page, file: Given) {
  await picker(page).setInputFiles(typeof file === 'string' ? fixture(file) : file);
}
const nameOf = (file: Given) => (typeof file === 'string' ? file : file.name);

/** Waits until this file is listed and read: its row is there, none says "Getting ready", and the first field is on screen. */
async function waitUntilRead(page: Page, file: Given) {
  await expect(rows(page).filter({ hasText: nameOf(file) })).toHaveCount(1, { timeout: 30000 });
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
  await expect(first(page)).toBeVisible({ timeout: 30000 });
}

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

/** Types the password in both fields. */
async function typeTwice(page: Page, password = typed) {
  await first(page).fill(password);
  await again(page).fill(password);
}

/** Types the password twice, checks the main button now works, presses it and downloads the result. */
async function protectAndDownload(page: Page, password = typed): Promise<{ download: Download; bytes: Uint8Array }> {
  await typeTwice(page, password);
  await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
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

/** Neither password field carries a `value` attribute, and the page's HTML does not hold the password. */
async function expectNotInMarkup(page: Page, password: string) {
  const markup = await page.evaluate(() => ({
    attributes: [...document.querySelectorAll('input[type=password]')].map((input) => input.getAttribute('value')),
    html: document.documentElement.outerHTML,
  }));
  for (const value of markup.attributes) expect(value).toBeNull();
  expect(markup.html).not.toContain(password);
  expect(markup.html).not.toContain(password.replaceAll('&', '&amp;'));
}

/** An engine that reads a file as ready and then does what `run` says, in place of the real one. */
const fakeEngine = (run: string) => `export const loads = { read: ['qpdf'], job: ['qpdf'] }; export const inspect = async () => ({ kind: 'ready', pages: 3 }); export const run = async () => { ${run} };`;
const engineFile = /\/_astro\/protect-pdf-[A-Za-z0-9_-]{8}\.js$/;

// ---------------------------------------------------------------------------

test.describe('choosing a file', () => {
  test('lists one row with its first page, pages and size, no Remove and no summary line; then both fields empty, focus in the first, and the main button waiting', async ({ page }) => {
    await open(page);
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(first(page)).toHaveCount(0);
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
    await expect(first(page)).toHaveCount(0);
    await expect(again(page)).toHaveCount(0);
    release();
    await waitUntilRead(page, 'text.pdf');
    const size = formatSize(readFileSync(fixture('text.pdf')).length);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(summary(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    await expect(status(page)).toHaveText(`text.pdf, 3 pages, ${size}.`);
    await expect(first(page)).toBeFocused();
    await expect(first(page)).toHaveValue('');
    await expect(again(page)).toHaveValue('');
    await expect(page.getByText(hint)).toBeVisible();
    await expect(page.getByText(note)).toBeVisible();
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toHaveAccessibleDescription('Type a password first.');
    await expect(whyNot(page)).toHaveText('Type a password first.');
    const order = await page.evaluate(() => {
      const at = (selector: string) => [...document.querySelectorAll('astro-island *')].indexOf(document.querySelector(selector)!);
      return [at('astro-island ol'), at('input[type=password]'), at('#protect-pdf-main')];
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
    await expect(first(page)).toHaveCount(0);
  });
});

test.describe('the fields', () => {
  test('two hidden fields for a password being set, with no name, length cap or form; "Next" then "Go"; the hint alone between them and the note after the second, read with the first', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    for (const field of [first(page), again(page)]) {
      await expect(field).toHaveAttribute('type', 'password');
      await expect(field).toHaveAttribute('autocomplete', 'new-password');
      await expect(field).not.toHaveAttribute('name', /.*/);
      await expect(field).not.toHaveAttribute('maxlength', /.*/);
      expect(await field.evaluate((input: HTMLInputElement) => input.form === null && input.closest('form') === null)).toBe(true);
    }
    await expect(first(page)).toHaveAttribute('enterkeyhint', 'next');
    await expect(again(page)).toHaveAttribute('enterkeyhint', 'go');
    await expect(first(page)).toHaveAccessibleDescription(`${hint} ${note}`);
    await expect(again(page)).toHaveAccessibleDescription('');
    // The only text between the first field and the second field's label is the hint; the note comes after the second field.
    const between = await page.evaluate(() => {
      const [one, two] = [...document.querySelectorAll('input[type=password]')] as HTMLInputElement[];
      const label = document.querySelector(`label[for="${two!.id}"]`)!;
      const range = document.createRange();
      range.setStartAfter(one!);
      range.setEndBefore(label);
      const noteParagraph = document.getElementById(`${one!.id}-note`)!;
      return {
        text: range.toString().trim(),
        noteAfterSecond: Boolean(two!.compareDocumentPosition(noteParagraph) & Node.DOCUMENT_POSITION_FOLLOWING),
        gap: label.getBoundingClientRect().top - one!.getBoundingClientRect().bottom,
        width: window.innerWidth,
      };
    });
    expect(between.text).toBe(hint);
    expect(between.text.startsWith('If you forget this password')).toBe(true);
    expect(between.noteAfterSecond).toBe(true);
    // At 360px the second field's label starts close under the first field.
    if (between.width <= 360) expect(between.gap).toBeLessThanOrEqual(200);
    await noSidewaysScroll(page);
  });

  test('Tab goes from the first field to the second, then "Choose another file", then the main button', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await expect(first(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(again(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(anotherFile(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(mainButton(page)).toBeFocused();
  });
});

test.describe('Enter', () => {
  test('in the first field with an accepted password, focus moves to the second and no job starts; empty or "café", it says why and stays', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await first(page).press('Enter');
    await expect(status(page)).toHaveText('Type a password first.');
    await expect(first(page)).toBeFocused();
    await first(page).press('Enter');
    await expect(status(page)).toHaveText('Type a password first. ');
    await first(page).fill('café');
    await first(page).press('Enter');
    await expect(status(page)).toHaveText(charactersSentence);
    await expect(first(page)).toBeFocused();
    await first(page).fill(typed);
    await first(page).press('Enter');
    await expect(again(page)).toBeFocused();
    await expect(cancel(page)).toHaveCount(0);
    await expect(page.locator('[role=progressbar]')).toHaveCount(0);
  });

  test('in the second field, once both match, the job starts', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await typeTwice(page);
    await again(page).press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 60000 });
    await expect(page.locator('astro-island section')).toContainText('text-protected.pdf');
  });
});

test.describe('the main button waits', () => {
  test('empty, typed once, part-typed again, then different, with the sentences in their places and said once', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await expect(whyNot(page)).toHaveText('Type a password first.');
    await first(page).fill(typed);
    await expect(whyNot(page)).toHaveText('Type the password again to check it.');
    await expect(mainButton(page)).toHaveAccessibleDescription('Type the password again to check it.');
    await again(page).fill(typed.slice(0, 4));
    await expect(whyNot(page)).toHaveText('Type the password again to check it.');
    for (const field of [first(page), again(page)]) await expect(field).not.toHaveAttribute('aria-invalid', /.*/);
    await recordStatus(page);
    await again(page).fill(`${typed.slice(0, 4)}x`);
    await expect(again(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(first(page)).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(page.locator('p[id$="-again-error"]')).toHaveText(mismatchSentence);
    await expect(again(page)).toHaveAccessibleDescription(mismatchSentence);
    await expect(mainButton(page)).toHaveAccessibleDescription(mismatchSentence);
    await again(page).press('End');
    await again(page).pressSequentially('yz');
    await expect(status(page)).toHaveText(mismatchSentence);
    expect((await saidInStatus(page)).filter((said) => said === mismatchSentence)).toHaveLength(1);
    // A press while waiting starts no job.
    await mainButton(page).click({ force: true });
    await expect(cancel(page)).toHaveCount(0);
    await expect(resultHeading(page)).toHaveCount(0);
  });

  test('"café", and 128 characters pasted and kept whole, mark the first field with the shared sentence', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await first(page).fill('café');
    await expect(first(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('p[id$="-newPassword-error"]')).toHaveText(charactersSentence);
    await expect(first(page)).toHaveAccessibleDescription(`${charactersSentence} ${hint} ${note}`);
    await expect(mainButton(page)).toHaveAccessibleDescription(charactersSentence);
    const long = 'a'.repeat(128);
    await first(page).fill(long);
    await expect(first(page)).toHaveValue(long);
    await expect(page.locator('p[id$="-newPassword-error"]')).toHaveText('This password is too long. Use 127 characters or fewer.');
    await mainButton(page).click({ force: true });
    await expect(cancel(page)).toHaveCount(0);
  });

  test('a space at the end is shown only once focus leaves the first field', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await first(page).pressSequentially('open ');
    await expect(first(page)).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(whyNot(page)).toHaveText('Type the password again to check it.');
    await page.keyboard.press('Tab');
    await expect(first(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('p[id$="-newPassword-error"]')).toHaveText('A password cannot start or end with a space.');
  });
});

test.describe('protecting', () => {
  test('text.pdf with "Kv4 #%@ wq9": text-protected.pdf, which passes qpdf --check with it, opens in PDF.js with it and not without, and does not hold it', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'text.pdf');
    const { download, bytes } = await protectAndDownload(page);
    expect(download.suggestedFilename()).toBe('text-protected.pdf');
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 3 pages`);
    for (const each of resultNotes) await expect(page.getByText(each)).toBeVisible();
    expect((await qpdfOn(bytes, [`--password=${typed}`, '--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, ['--check'])).code).not.toBe(0);
    expect(await pdfjsOpens(bytes, typed)).toBe(3);
    expect(await pdfjsOpens(bytes)).toBe('PasswordException');
    expect(await pdfjsOpens(bytes, typed.slice(0, -1))).toBe('PasswordException');
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(typed);
    await noSidewaysScroll(page);
  });

  test('progress on pages-500.pdf: "Reading the file", then "Writing the protected file", with a bar that never goes back', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'pages-500.pdf');
    await typeTwice(page);
    await recordProgress(page);
    await mainButton(page).click();
    await expect(resultHeading(page)).toBeFocused({ timeout: 90000 });
    const progress = await recorded(page);
    const lines = [...new Set(progress.map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    expect(lines).toEqual(['Reading the file', 'Writing the protected file']);
    const values = progress.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  test('Cancel stops the job and lists the file again with both fields as typed and the main button ready', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine('await new Promise(() => {});') }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await typeTwice(page);
    await expectNotInMarkup(page, typed);
    await mainButton(page).click();
    await cancel(page).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(rows(page)).toContainText('text.pdf');
    await expect(first(page)).toHaveValue(typed);
    await expect(again(page)).toHaveValue(typed);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(resultHeading(page)).toHaveCount(0);
    await expectNotInMarkup(page, typed);
  });
});

test.describe('failures', () => {
  const cases: [string, string, string][] = [
    ['the browser runs out of memory', "throw new RangeError('Array buffer allocation failed');", 'Your browser ran out of memory. Try on a computer.'],
    ['the new file would be far too large', "const error = new Error('x'); error.name = 'OutputLimit'; throw error;", outputLimitSentence],
    ['the engine refuses the password', "const error = new Error('x'); error.name = 'PasswordRefused'; throw error;", 'The password could not be used. Go back to your file and type it again.'],
  ];
  for (const [what, run, sentence] of cases) {
    test(`when ${what}, the page says so; "Go back to your file" keeps both fields, with focus on the main button`, async ({ page, context }) => {
      await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine(run) }));
      await open(page);
      await pickReady(page, 'text.pdf');
      await typeTwice(page);
      await mainButton(page).click();
      await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
      await expect(page.getByText(sentence)).toBeVisible();
      await goBack(page).click();
      await expect(rows(page)).toContainText('text.pdf');
      await expect(first(page)).toHaveValue(typed);
      await expect(again(page)).toHaveValue(typed);
      await expect(mainButton(page)).toBeFocused();
      await expectNotInMarkup(page, typed);
    });
  }

  test('when the engine cannot be fetched, the page says so', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.abort());
    await open(page);
    await pick(page, 'text.pdf');
    await expect(failedHeading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });
});

test.describe('how long the password is held', () => {
  test('after the result, and after "Start again", both fields are empty for the next file', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'text.pdf');
    await protectAndDownload(page);
    await page.getByRole('button', { name: 'Start again' }).click();
    await pickReady(page, 'text.pdf');
    await expect(first(page)).toHaveValue('');
    await expect(again(page)).toHaveValue('');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(whyNot(page)).toHaveText('Type a password first.');
  });

  test('"Choose another file" keeps both fields', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await typeTwice(page);
    await pickReady(page, 'mixed.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('mixed.pdf');
    await expect(first(page)).toHaveValue(typed);
    await expect(again(page)).toHaveValue(typed);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a second file that needs its own password, left out at its password field, empties both fields', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await typeTwice(page);
    await pick(page, 'password.pdf');
    await expect(page.getByLabel('Password for password.pdf')).toBeFocused();
    await expect(first(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await pickReady(page, 'text.pdf');
    await expect(first(page)).toHaveValue('');
    await expect(again(page)).toHaveValue('');
  });

  test('leaving the page: straight after pagehide, no password field remains or each is empty, and the HTML does not hold the password', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await typeTwice(page);
    const left = await page.evaluate((password) => {
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      const fields = [...document.querySelectorAll('input[type=password]')] as HTMLInputElement[];
      return { values: fields.map((field) => field.value), html: document.documentElement.outerHTML.includes(password) };
    }, typed);
    for (const value of left.values) expect(value).toBe('');
    expect(left.html).toBe(false);
  });

  test('coming back with Back shows no file', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await typeTwice(page);
    await page.goto('/');
    await page.goBack();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('text.pdf');
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    expect(await picker(page).evaluate((input: HTMLInputElement) => input.files?.length ?? 0)).toBe(0);
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its own password with no new password field; a wrong one says so; the right one opens it with focus on "New password"', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pick(page, 'password.pdf');
    const passwordField = page.getByLabel('Password for password.pdf');
    await expect(passwordField).toBeFocused();
    await expect(page.getByText(/stays in (this|your) browser/).first()).toBeVisible();
    await expect(first(page)).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
    await passwordField.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await expect(passwordField).toBeFocused();
    await expect(first(page)).toHaveCount(0);
    await passwordField.fill(oldPassword);
    await page.keyboard.press('Enter');
    await expect(first(page)).toBeFocused({ timeout: 30000 });
    const { bytes } = await protectAndDownload(page);
    expect((await qpdfOn(bytes, [`--password=${typed}`, '--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, [`--password=${oldPassword}`, '--check'])).code).not.toBe(0);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(oldPassword);
  });

  for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf']) {
    test(`${name} says it is damaged, shows no password fields, and offers to choose another`, async ({ page }) => {
      await open(page);
      await pick(page, name);
      await expect(page.getByRole('heading', { name: `${name} is damaged and cannot be read.` })).toBeVisible();
      await expect(page.getByRole('link', { name: /Repair/ })).toHaveCount(0);
      await expect(first(page)).toHaveCount(0);
      await page.getByRole('button', { name: 'Choose another file' }).click();
      await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    });
  }

  test('a file over 100 MB shows the notice, and the main button works once both fields match @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(first(page)).toBeVisible({ timeout: 60000 });
    await typeTwice(page);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a file of 120,000 pages shows the notice, and typing in the fields blocks nothing for more than 100 ms @desktop', async ({ page }) => {
    test.setTimeout(240_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(first(page)).toBeFocused({ timeout: 120000 });
    await watchLongTasks(page);
    await first(page).pressSequentially(typed, { delay: 20 });
    await page.keyboard.press('Enter');
    await expect(again(page)).toBeFocused();
    await again(page).pressSequentially(typed, { delay: 20 });
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await longTasks(page)).toEqual([]);
  });
});

test.describe('the words below the tool', () => {
  test('the heading, sentence, steps and questions are in the served page, before any script runs', async ({ request }) => {
    const html = await (await request.get('/protect-pdf')).text();
    expect(html).toContain('<title>Protect a PDF with a password in your browser - PDFkaro</title>');
    expect(html).toContain('content="Add a password to a PDF so it cannot be opened without it. The file and the password are not uploaded."');
    for (const words of [
      'Protect a PDF with a password</h1>',
      'Add a password that is needed to open a PDF. Your file stays on your device. This site does not upload your file or the password.',
      'How to protect a PDF with a password',
      'Press “Protect and download”',
      'Is my file uploaded?',
      'What if I forget the password?',
      'A short password can be guessed by anyone who has the file.',
      'My browser offered to save the password',
      'What changes and what stays?',
      'My file already has a password',
      'What does a password hide?',
      'which now ends in “-protected”',
      '<li>the size of some drawn parts, such as form-field boxes, and each page’s size if page numbers, a watermark or a signature were added on this site</li>',
      'Switching to another tab keeps them.',
    ]) {
      expect(html).toContain(words);
    }
    // What can still be seen is a plain list, and page sizes are not claimed as hidden.
    expect(html.match(/<ul>[\s\S]*?<\/ul>/)?.[0].match(/<li>/g)).toHaveLength(7);
    expect(html).not.toContain('pages and their sizes');
    // The word "unlock" is never said: since Remove a password is published, it is only in the address of
    // Protect's related link to it (owner, 22 Nov 2026), which is taken out before the page is searched.
    expect(html).toContain('href="/unlock-pdf"');
    expect(html.replaceAll('/unlock-pdf', '').toLowerCase()).not.toContain('unlock');
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Protect's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts): no drawing step, pdf-lib or fflate. */
const filesAfterPick = () => toolFiles('protect-pdf').all;
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

test.describe('nothing is uploaded', () => {
  test('qz7report.pdf (a protected file), its password and the new password "Qz7 pw#%@ Kv4": only the listed files fetched, nothing named, both consoles silent on them, the download free of them', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const newPassword = 'Qz7 pw#%@ Kv4';
    // Watched before the page opens, so the tool worker's console is heard from its start.
    const heard = listen(page);
    await open(page);
    const seen = watch(context, page);
    await pick(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) });
    await page.getByLabel(/^Password for /).fill(oldPassword);
    await page.keyboard.press('Enter');
    await waitUntilRead(page, 'qz7report.pdf');
    await typeTwice(page, newPassword);
    await expectNotInMarkup(page, newPassword);
    const { download, bytes } = await protectAndDownload(page, newPassword);
    expect(download.suggestedFilename()).toBe('qz7report-protected.pdf');
    expect((await qpdfOn(bytes, [`--password=${newPassword}`, '--check'])).code).toBe(0);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).not.toContain(newPassword);
    expect(text).not.toContain(oldPassword);

    const secrets = withEncoded(['qz7report.pdf', 'qz7report', oldPassword, newPassword, 'Qz7', 'pw#%@', 'Kv4']);
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    const fetched = fetchedPaths(seen);
    // The engine and the option values were fetched, and nothing of the drawing step, pdf-lib, fflate or another tool.
    for (const name of [/\/protect-pdf-/, /\/option-values-/, /\/qpdf-/]) expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
    for (const other of [/\/stamp-/, /\/pdflib-/, /\/fflate-/, /\/picture-/, /\/add-page-numbers-/, /\/watermark-pdf-/, /\/sign-pdf-/, /\/compress-pdf-/, /\/merge-pdf-/, /\/split-pdf-/]) {
      expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
    }
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });

  test('rich.pdf, tagged.pdf and form.pdf protected: no bookmark title, attachment name, document title, hidden text or field value leaves, and the address holds nothing', async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    const newPassword = 'Qz7 pw#%@ Kv4';
    const secrets = withEncoded([
      'Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment',
      'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE',
      'A tagged file', 'A fillable form', 'Sample text', newPassword, 'Qz7', 'pw#%@', 'Kv4',
    ]);
    const heard = listen(page);
    await open(page);
    const seen = watch(context, page);
    for (const name of ['rich.pdf', 'tagged.pdf', 'form.pdf']) {
      await pickReady(page, name);
      const { bytes } = await protectAndDownload(page, newPassword);
      expect(Buffer.from(bytes).toString('latin1')).not.toContain(newPassword);
      await page.getByRole('button', { name: 'Start again' }).click();
    }
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, heard.said);
    expect(heard.errors).toEqual([]);
  });
});
