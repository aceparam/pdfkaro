// Sign PDF in a real browser, at a phone width and a desktop width, with the
// real engine: choosing a file, the three ways to make the signature (typing,
// drawing and a picture), signing a file and checking the download, every
// state, and the promise that nothing about a file, its password, the name, the
// drawing or the picture leaves the device.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { type Browser, type BrowserContext, type Download, type Page } from '@playwright/test';
import { expect, test, watchPolicy } from './fixtures';
import { expectRepairLink } from './repair-link';
import { createQpdf } from '../../src/engines/qpdf';
import { formatSize } from '../../src/widget/format';
import { changed, pictures, texts } from '../unit/stamp-helpers';
import { headersRead, traces, violations, watch, type Seen } from './no-upload';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fixture = (name: string) => join(here, '../fixtures', name);
const pictureFile = (name: string) => join(here, '../fixtures/pictures', name);
const password = 'open-sesame';
const typed = 'Jq5name Vx2sig';
const hint = 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.';
const advice = 'To use other letters, choose “Draw it” or “Use a picture of it” above.';
const padHint = 'Use a finger, a mouse or a pen in the box. To use a keyboard, choose “Type your name” above.';
const pictureHint = 'A JPG or PNG picture. One over 8 MB or 16 million pixels still works but makes the signed file large. A picture with a see-through background works best.';
const outputLimitSentence = 'The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.';

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page) => page.getByRole('button', { name: 'Sign and download' });
const rows = (page: Page) => page.locator('astro-island ol > li');
const summary = (page: Page) => page.locator('astro-island p[tabindex="-1"]');
const status = (page: Page) => page.locator('[role=status]').first();
const way = (page: Page, name: 'Type your name' | 'Draw it' | 'Use a picture of it') => page.getByRole('radio', { name, exact: true });
const field = (page: Page) => page.getByRole('textbox', { name: 'Your name' });
const pad = (page: Page) => page.getByRole('img', { name: 'Draw your signature' });
const clear = (page: Page) => page.getByRole('button', { name: 'Clear the drawing' });
const choosePicture = (page: Page) => page.getByLabel(/^Choose (a|another) picture$/);
const whyNot = (page: Page) => page.locator('#sign-pdf-why-not');
/** The line naming the chosen picture, under the field's label (the status region says it too). */
const chosenLine = (page: Page) => page.locator('p[id$="-picture-chosen"]');
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your signed file is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The signature was not added.' });
const anotherFile = (page: Page) => page.getByLabel('Choose another file');
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page) {
  await page.goto('/sign-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

type Given = string | { name: string; mimeType: string; buffer: Buffer };
async function pick(page: Page, file: Given) {
  await picker(page).setInputFiles(typeof file === 'string' ? fixture(file) : file);
}
const nameOf = (file: Given) => (typeof file === 'string' ? file : file.name);

/**
 * Waits until this file is listed and really read: its row is there, no row says "Getting ready", and the choice of
 * ways, which shows only once every listed file has been read, is on screen. Checking only that no row says
 * "Getting ready" would pass at once, before the row of a new file is even listed.
 */
async function waitUntilRead(page: Page, file: Given) {
  await expect(rows(page).filter({ hasText: nameOf(file) })).toHaveCount(1, { timeout: 30000 });
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
  await expect(way(page, 'Type your name')).toBeVisible({ timeout: 30000 });
}

/** Picks a file and waits until it has been read. */
async function pickReady(page: Page, file: Given) {
  await pick(page, file);
  await expect(rows(page)).toHaveCount(1);
  await waitUntilRead(page, file);
}

async function drop(page: Page, files: { path: string; name: string; type: string }[]) {
  const given = files.map(({ path, name, type }) => ({ name, type, data: readFileSync(path).toString('base64') }));
  await page.evaluate((list) => {
    const transfer = new DataTransfer();
    for (const { name, type, data } of list) transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type }));
    for (const kind of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(kind, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, given);
}

/** Draws lines in the pad with the mouse: each a list of points as shares of the pad's width and height. */
async function drawWithMouse(page: Page, lines: [number, number][][]) {
  await pad(page).scrollIntoViewIfNeeded();
  const box = (await pad(page).boundingBox())!;
  for (const line of lines) {
    const [first, ...rest] = line;
    await page.mouse.move(box.x + first![0] * box.width, box.y + first![1] * box.height);
    await page.mouse.down();
    for (const [x, y] of rest) await page.mouse.move(box.x + x * box.width, box.y + y * box.height, { steps: 8 });
    await page.mouse.up();
  }
}
/** Two lines across the pad: a wave and a stroke under it. */
const twoLines: [number, number][][] = [
  [
    [0.1, 0.5],
    [0.3, 0.2],
    [0.5, 0.7],
    [0.7, 0.3],
    [0.9, 0.5],
  ],
  [
    [0.2, 0.85],
    [0.8, 0.85],
  ],
];

/** Whether the pad's canvas has anything painted at a point given as shares of its width and height. Read only by the test. */
async function painted(page: Page, x: number, y: number): Promise<boolean> {
  return pad(page).evaluate(
    (canvas, [px, py]) => {
      const c = canvas as HTMLCanvasElement;
      const data = c.getContext('2d')!.getImageData(Math.round(px! * c.width) - 3, Math.round(py! * c.height) - 3, 7, 7).data;
      for (let k = 3; k < data.length; k += 4) if (data[k]! > 0) return true;
      return false;
    },
    [x, y],
  );
}

/** Presses the main button, waits for the result, and downloads it. */
async function signAndDownload(page: Page): Promise<{ download: Download; bytes: Uint8Array }> {
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

/** An engine that reads a file and a picture as ready and then does what `run` says, in place of the real one. */
const fakeEngine = (run: string) =>
  `export const loads = { read: ['qpdf', 'fflate'], job: ['qpdf', 'fflate', 'pdflib'] }; export const inspect = async () => ({ kind: 'ready', pages: 3 }); export const inspectPicture = async () => ({ kind: 'ready', pixels: 38400 }); export const run = async () => { ${run} };`;
const engineFile = /\/_astro\/sign-pdf-[A-Za-z0-9_-]{8}\.js$/;
const pdflibFile = /\/_astro\/pdflib-[A-Za-z0-9_-]{8}\.js$/;

/** The order of elements in the widget, by selector. */
const orderOf = (page: Page, selectors: string[]) =>
  page.evaluate((list) => {
    const all = [...document.querySelectorAll('astro-island *')];
    return list.map((selector) => all.indexOf(document.querySelector(selector)!));
  }, selectors);

// ---------------------------------------------------------------------------
// Pictures made here.

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
/** A PNG of noise, 8-bit RGB, which does not pack: about 3 bytes a pixel. */
function noisePng(width: number, height: number): Buffer {
  const row = width * 3 + 1;
  const raw = randomBytes(row * height);
  for (let y = 0; y < height; y++) raw[y * row] = 0;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw, { level: 1 })), pngChunk('IEND', Buffer.alloc(0))]);
}
/** alpha.png with a text chunk holding `marker` after its header, as a camera or editor writes one. */
function markedPng(marker: string): Buffer {
  const bytes = readFileSync(pictureFile('alpha.png'));
  const afterHeader = 8 + 8 + 13 + 4;
  return Buffer.concat([bytes.subarray(0, afterHeader), pngChunk('tEXt', Buffer.from(`Comment\0${marker}`, 'latin1')), bytes.subarray(afterHeader)]);
}
const asPng = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });

// ---------------------------------------------------------------------------

test.describe('choosing a file', () => {
  test('lists one row with its first page, pages and size, no Remove and no summary line; then the three ways with "Type your name" chosen and focused, the empty field, the pages and the place, and the main button waiting', async ({ page }) => {
    await open(page);
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
    await expect(way(page, 'Type your name')).toHaveCount(0);
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
    await expect(way(page, 'Type your name')).toHaveCount(0);
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
    // The choice labels say what follows them.
    const labels = await page.getByRole('group', { name: 'How to add your signature' }).locator('label').allTextContents();
    expect(labels).toEqual(['Type your name', 'Draw it', 'Use a picture of it']);
    await expect(way(page, 'Type your name')).toBeChecked();
    await expect(way(page, 'Type your name')).toBeFocused();
    await expect(field(page)).toHaveValue('');
    await expect(field(page)).toHaveAccessibleDescription(hint);
    await expect(pad(page)).toHaveCount(0);
    await expect(choosePicture(page)).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Which pages to sign' }).locator('label')).toHaveText(['Last page', 'First page', 'Every page']);
    await expect(page.getByRole('radio', { name: 'Last page' })).toBeChecked();
    await expect(page.getByRole('group', { name: 'Where on the page' }).locator('label')).toHaveText(['Bottom left', 'Bottom centre', 'Bottom right', 'Top left', 'Top centre', 'Top right']);
    await expect(page.getByRole('radio', { name: 'Bottom right' })).toBeChecked();
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toHaveAccessibleDescription('Type your name first.');
    await expect(whyNot(page)).toHaveText('Type your name first.');
    // The row, the ways, the name, the pages, the place, then the main button.
    const order = await orderOf(page, ['astro-island ol', 'input[value=type]', 'input[type=text]', 'input[value=last]', 'input[value=bottom-right]', '#sign-pdf-main']);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await noSidewaysScroll(page);
  });

  test('two files dropped at once: the first is listed, and the page says the tool takes one file', async ({ page }) => {
    await open(page);
    await drop(page, [
      { path: fixture('text.pdf'), name: 'contract.pdf', type: 'application/pdf' },
      { path: fixture('mixed.pdf'), name: 'notes.pdf', type: 'application/pdf' },
    ]);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('contract.pdf');
    await expect(page.locator('p:not([role=status])', { hasText: 'This tool takes one file, so notes.pdf was not added.' })).toBeVisible();
  });

  test('a file that is not a PDF is refused by name, and a picture dropped on the page while a PDF is listed is refused as not a PDF', async ({ page }) => {
    await open(page);
    await pick(page, 'not-a-pdf.pdf');
    await expect(page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await pickReady(page, 'text.pdf');
    await drop(page, [{ path: pictureFile('alpha.png'), name: 'signature.png', type: 'image/png' }]);
    await expect(page.locator('p:not([role=status])', { hasText: 'signature.png is not a PDF, so it was not added.' })).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('text.pdf');
    // The picture field was not given it either.
    await way(page, 'Use a picture of it').check();
    await expect(choosePicture(page)).toHaveAccessibleName('Choose a picture');
  });
});

test.describe('the three ways', () => {
  test('the arrow keys change the way: the matching input appears after the choice, focus stays on the radio button, each way has its sentence, and a typed name is kept', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await page.keyboard.press('Tab');
    await expect(field(page)).toBeFocused();
    await page.keyboard.type('Jane Doe');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await way(page, 'Type your name').focus();

    await page.keyboard.press('ArrowDown');
    await expect(way(page, 'Draw it')).toBeChecked();
    await expect(way(page, 'Draw it')).toBeFocused();
    await expect(field(page)).toHaveCount(0);
    await expect(pad(page)).toBeVisible();
    await expect(pad(page)).toHaveAccessibleDescription(padHint);
    await expect(clear(page)).toBeVisible();
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(whyNot(page)).toHaveText('Draw your signature first.');
    // The pad comes after the choice and before the pages.
    const drawOrder = await orderOf(page, ['input[value=draw]', 'canvas', 'input[value=last]']);
    expect(drawOrder).toEqual([...drawOrder].sort((a, b) => a - b));
    // Tab from the chosen way goes to Clear (the box takes no Tab stop), then the pages.
    await page.keyboard.press('Tab');
    await expect(clear(page)).toBeFocused();
    await expect(clear(page)).toHaveAccessibleDescription(padHint);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'Last page' })).toBeFocused();
    await way(page, 'Draw it').focus();

    await page.keyboard.press('ArrowDown');
    await expect(way(page, 'Use a picture of it')).toBeChecked();
    await expect(way(page, 'Use a picture of it')).toBeFocused();
    await expect(pad(page)).toHaveCount(0);
    await expect(page.getByText('Picture of your signature', { exact: true })).toBeVisible();
    await expect(page.getByText(pictureHint)).toBeVisible();
    await expect(whyNot(page)).toHaveText('Choose a picture of your signature first.');
    await page.keyboard.press('Tab');
    await expect(choosePicture(page)).toBeFocused();
    await expect(choosePicture(page)).toHaveAccessibleName('Choose a picture');
    await way(page, 'Use a picture of it').focus();

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(way(page, 'Type your name')).toBeChecked();
    await expect(way(page, 'Type your name')).toBeFocused();
    await expect(field(page)).toHaveValue('Jane Doe');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await noSidewaysScroll(page);
  });

  test('Tab goes from "Type your name" to the field, the chosen page, the chosen place, "Choose another file", then the main button', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await expect(way(page, 'Type your name')).toBeFocused();
    for (const next of [field(page), page.getByRole('radio', { name: 'Last page' }), page.getByRole('radio', { name: 'Bottom right' }), anotherFile(page), mainButton(page)]) {
      await page.keyboard.press('Tab');
      await expect(next).toBeFocused();
    }
  });
});

test.describe('typing a name', () => {
  test('while empty, pressing the main button fetches no pdf-lib file and starts no job; "Jq5name Vx2sig" makes it work, and Enter starts the job', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    const fetched: string[] = [];
    page.on('request', (request) => fetched.push(request.url()));
    await mainButton(page).click({ force: true });
    await field(page).fill('   ');
    await mainButton(page).click({ force: true });
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    expect(fetched.filter((url) => pdflibFile.test(url))).toEqual([]);
    await field(page).press('Enter');
    await expect(status(page)).toHaveText('Type your name first.');
    await field(page).fill(typed);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(whyNot(page)).toHaveCount(0);
    await field(page).press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 60000 });
    await expect(page.locator('astro-island section')).toContainText('text-signed.pdf');
  });

  test('"सीता": marked invalid, the sentence with the tool\'s advice between the label and the field, tied to the button and said once, and a press does nothing; "Łukasz" names Ł with the same advice', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await recordStatus(page);
    await field(page).pressSequentially('सीता');
    const sentence = `Some characters cannot be used. ${advice}`;
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
    const error = page.locator('p[id$="-name-error"]');
    await expect(error).toHaveText(sentence);
    await expect(field(page)).toHaveAccessibleDescription(`${sentence} ${hint}`);
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toHaveAccessibleDescription(sentence);
    await expect(status(page)).toHaveText(sentence);
    expect((await saidInStatus(page)).filter((said) => said === sentence)).toHaveLength(1);
    await expect(error).not.toContainText('स');
    await mainButton(page).click({ force: true });
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await field(page).fill('Łukasz');
    await expect(error).toHaveText(`Ł cannot be used. ${advice}`);
  });

  test('63 characters pasted are kept whole with their sentence', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    const long = 'Jane Alexandra Doe-Smithson of the Old Mill House, Much Hadhams';
    expect([...long]).toHaveLength(63);
    await field(page).fill(long);
    await expect(field(page)).toHaveValue(long);
    await expect(page.locator('p[id$="-name-error"]')).toHaveText('This text has 63 characters. Use 50 or fewer.');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('drawing', () => {
  test('two lines with the mouse make the main button work; Clear empties the pad and says so; a full drawing says so once', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Draw it').check();
    await recordStatus(page);
    await drawWithMouse(page, twoLines);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await painted(page, 0.5, 0.85)).toBe(true);
    expect(await painted(page, 0.5, 0.05)).toBe(false);
    await clear(page).click();
    await expect(status(page)).toHaveText('The drawing is cleared.');
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(whyNot(page)).toHaveText('Draw your signature first.');
    expect(await painted(page, 0.5, 0.85)).toBe(false);
    // 200 lines fill the drawing; the next press draws nothing.
    const box = (await pad(page).boundingBox())!;
    for (let n = 0; n < 200; n++) {
      await page.mouse.move(box.x + 5 + (n % 20) * (box.width / 21), box.y + 5 + Math.floor(n / 20) * (box.height / 11));
      await page.mouse.down();
      await page.mouse.up();
    }
    await expect(status(page)).toHaveText('The drawing is full. Clear it to start again.');
    expect((await saidInStatus(page)).filter((said) => said === 'The drawing is full. Clear it to start again.')).toHaveLength(1);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.96);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.96, { steps: 5 });
    await page.mouse.up();
    expect(await painted(page, 0.7, 0.96)).toBe(false);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('the window resized: the drawing is shown whole, in the same place in the box', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Draw it').check();
    await drawWithMouse(page, twoLines);
    const before = page.viewportSize()!;
    await page.setViewportSize({ width: Math.round(before.width * 0.8), height: before.height });
    await expect.poll(async () => (await pad(page).boundingBox())!.width).toBeLessThan(before.width * 0.8);
    await expect.poll(() => painted(page, 0.5, 0.85)).toBe(true);
    expect(await painted(page, 0.9, 0.5)).toBe(true);
    expect(await painted(page, 0.5, 0.05)).toBe(false);
    await page.setViewportSize(before);
  });

  test('on a short, wide screen, such as a phone turned sideways, the pad is at most 60% of the height, still 5 to 2', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await open(page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Draw it').check();
    const box = (await pad(page).boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(0.6 * 360 + 1);
    expect(box.width / box.height).toBeCloseTo(2.5, 1);
    await noSidewaysScroll(page);
  });

  test.describe('with touch', () => {
    test.use({ hasTouch: true });

    test('a finger draws two lines without moving the page or selecting text; a second finger draws nothing; the same swipe beside the pad scrolls the page', async ({ page }) => {
      await open(page);
      await pickReady(page, 'text.pdf');
      await way(page, 'Draw it').check();
      await pad(page).scrollIntoViewIfNeeded();
      const cdp = await page.context().newCDPSession(page);
      const box = (await pad(page).boundingBox())!;
      const at = (x: number, y: number, id = 1) => ({ x: box.x + x * box.width, y: box.y + y * box.height, id });
      const scrolled = () => page.evaluate(() => window.scrollY);
      const before = await scrolled();
      const swipe = async (points: { x: number; y: number; id: number }[]) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]!] });
        for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      // An upward swipe across the pad would scroll the page down anywhere else.
      await swipe(Array.from({ length: 12 }, (_, n) => at(0.1 + n * 0.07, 0.9 - n * 0.07)));
      await swipe(Array.from({ length: 8 }, (_, n) => at(0.2 + n * 0.08, 0.8)));
      await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
      expect(await scrolled()).toBe(before);
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
      expect(await painted(page, 0.1 + 6 * 0.07, 0.9 - 6 * 0.07)).toBe(true);
      // A second finger, down while the first draws, draws nothing along its own path.
      const first = at(0.05, 0.1, 1);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
      // Along the bottom right of the pad, where no other line passes.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, at(0.6, 0.95, 2)] });
      for (let n = 1; n <= 6; n++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [first, at(0.6 + n * 0.05, 0.95, 2)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await painted(page, 0.8, 0.95)).toBe(false);
      expect(await scrolled()).toBe(before);
      // The same swipe, in the direction the page has room to move: on the pad it draws and the page stays; outside the
      // pad, under it, it scrolls the page past it.
      const roomBelow = await page.evaluate(() => window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 300);
      const step = roomBelow ? -20 : 20;
      const across = (x: number, y: number) => Array.from({ length: 12 }, (_, n) => ({ x, y: y + n * step, id: 4 }));
      const startShare = roomBelow ? 0.95 : 0.05;
      await swipe(across(box.x + box.width * 0.9, box.y + box.height * startShare));
      expect(await scrolled()).toBe(before);
      // Painted part way along the swipe, a few steps in.
      expect(await painted(page, 0.9, startShare + (3 * step) / box.height)).toBe(true);
      // Outside the pad, beside it in the page's margin, the same swipe scrolls the page.
      const beside = box.x + box.width + (page.viewportSize()!.width - box.x - box.width) / 2;
      expect(beside).toBeGreaterThan(box.x + box.width + 4);
      await swipe(across(beside, box.y + box.height / 2 - 6 * step));
      await expect.poll(scrolled).not.toBe(before);
    });
  });
});

test.describe('a picture', () => {
  test('alpha.png is named with its size and said once; the button\'s words change; the main button works; no <img> is made for it', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Use a picture of it').check();
    await expect(choosePicture(page)).toHaveAccessibleName('Choose a picture');
    await expect(choosePicture(page)).toHaveAttribute('accept', 'image/jpeg,image/png');
    await recordStatus(page);
    await choosePicture(page).setInputFiles(pictureFile('alpha.png'));
    const line = `alpha.png, ${formatSize(readFileSync(pictureFile('alpha.png')).length)}.`;
    await expect(chosenLine(page)).toHaveText(line, { timeout: 30000 });
    await expect(status(page)).toHaveText(line);
    expect((await saidInStatus(page)).filter((said) => said === line)).toHaveLength(1);
    await expect(choosePicture(page)).toHaveAccessibleName('Choose another picture');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(whyNot(page)).toHaveCount(0);
    // Only the file's own thumbnail is an image on the page.
    await expect(page.locator('astro-island img')).toHaveCount(1, { timeout: 20000 });
    expect(await page.locator('astro-island img').getAttribute('alt')).not.toContain('alpha');
  });

  test('broken.png, arithmetic.jpg and a text file named notes.png each get their sentence; the last leaves no picture chosen', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Use a picture of it').check();
    const cases: [Given | string, string][] = [
      [pictureFile('broken.png'), 'broken.png is damaged and cannot be read. Choose another picture.'],
      [pictureFile('arithmetic.jpg'), 'arithmetic.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy, and choose the copy.'],
      [{ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('These are my notes, not a picture.') }, 'notes.png is not a JPG or PNG picture, so it was not used. No picture is chosen.'],
    ];
    for (const [file, sentence] of cases) {
      await choosePicture(page).setInputFiles(file);
      await expect(page.locator('p[id$="-picture-error"]')).toHaveText(sentence, { timeout: 30000 });
      await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
      await expect(mainButton(page)).toHaveAccessibleDescription(sentence);
    }
    await expect(choosePicture(page)).toHaveAccessibleName('Choose a picture');
    await mainButton(page).click({ force: true });
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  });

  test('a picture over 8 MB: a notice names its size and pixels, tied to the main button, which works', async ({ page }) => {
    await open(page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Use a picture of it').check();
    const big = noisePng(1700, 1700);
    expect(big.length).toBeGreaterThan(8 * 1024 * 1024);
    await choosePicture(page).setInputFiles(asPng('photo.png', big));
    const heading = `photo.png is ${formatSize(big.length)}, with 2.8 million pixels.`;
    await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 60000 });
    const text = 'A picture this large makes the signed file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead.';
    await expect(page.getByText(text)).toBeVisible();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(mainButton(page)).toHaveAccessibleDescription(`${heading} ${text}`);
  });

  test('a picture too large to place: the page names it with its size and what to do; "Go back to your file" keeps it', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine("const error = new Error('x'); error.name = 'PictureTooLarge'; throw error;") }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Use a picture of it').check();
    await choosePicture(page).setInputFiles(pictureFile('alpha.png'));
    const size = formatSize(readFileSync(pictureFile('alpha.png')).length);
    await expect(chosenLine(page)).toHaveText(`alpha.png, ${size}.`, { timeout: 30000 });
    await mainButton(page).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText(`alpha.png (${size}) is too large to place on these pages. Crop it to the signature, or save a smaller copy.`)).toBeVisible();
    await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
    await expect(way(page, 'Use a picture of it')).toBeChecked();
    await expect(chosenLine(page)).toHaveText(`alpha.png, ${size}.`);
    await expect(mainButton(page)).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// Signing for real.

/** Each page's size as PDF.js shows it, in points. */
async function shownSizes(bytes: Uint8Array) {
  const doc = await (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const sizes: { width: number; height: number }[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const viewport = (await doc.getPage(number)).getViewport({ scale: 1 });
    sizes.push({ width: viewport.width, height: viewport.height });
  }
  await doc.loadingTask.destroy();
  return sizes;
}

/** On every page, the changed pixels sit at its bottom right as shown, inside the margin of a twentieth of its shorter side. */
async function expectBottomRight(input: Uint8Array, output: Uint8Array, label: string) {
  const before = await pictures(input);
  const after = await pictures(output);
  const sizes = await shownSizes(input);
  after.forEach((picture, index) => {
    const box = changed(before[index]!, picture);
    const shorter = Math.min(picture.width, picture.height);
    const what = `${label}, page ${index + 1}`;
    expect(box.n, what).toBeGreaterThan(20);
    expect(box.left, what).toBeGreaterThan(0.5);
    expect(box.top, what).toBeGreaterThan(0.75);
    expect(picture.width - box.right * picture.width, what).toBeGreaterThanOrEqual(shorter / 20 - 1.5);
    expect(picture.height - box.bottom * picture.height, what).toBeGreaterThanOrEqual(shorter / 20 - 1.5);
    expect(sizes[index]!.width).toBeGreaterThan(0);
  });
}

test.describe('signing', () => {
  test('mixed.pdf on every page at the bottom right, once each way: each download passes qpdf --check, with the signature at each page\'s bottom right as PDF.js shows it', async ({ page }) => {
    test.setTimeout(180_000);
    const input = new Uint8Array(readFileSync(fixture('mixed.pdf')));
    await open(page);
    await pickReady(page, 'mixed.pdf');
    await page.getByRole('radio', { name: 'Every page' }).check();
    await expect(page.getByRole('radio', { name: 'Bottom right' })).toBeChecked();
    const ways: [string, () => Promise<void>][] = [
      ['typed', async () => field(page).fill(typed)],
      ['drawn', async () => {
        await way(page, 'Draw it').check();
        await drawWithMouse(page, twoLines);
      }],
      ['picture', async () => {
        await way(page, 'Use a picture of it').check();
        await choosePicture(page).setInputFiles(pictureFile('turn-6.jpg'));
        await expect(chosenLine(page)).toHaveText(/^turn-6\.jpg, /, { timeout: 30000 });
      }],
    ];
    for (const [label, make] of ways) {
      await make();
      const { download, bytes } = await signAndDownload(page);
      expect(download.suggestedFilename()).toBe('mixed-signed.pdf');
      expect((await qpdfOn(bytes, ['--check'])).code, label).toBe(0);
      expect((await qpdfOn(bytes, ['--show-npages'])).out.trim()).toBe('4');
      await expectBottomRight(input, bytes, label);
      if (label === 'typed') for (const items of await texts(bytes)) expect(items.at(-1)).toBe(typed);
      // Start again for the next way, with the same file.
      await page.getByRole('button', { name: 'Start again' }).click();
      await pickReady(page, 'mixed.pdf');
      await page.getByRole('radio', { name: 'Every page' }).check();
    }
  });

  test('a typed name on the last page only, untouched but for the name: the other pages are unchanged and the last page\'s text ends with the name; the result says what the file is', async ({ page }) => {
    test.setTimeout(120_000);
    const input = new Uint8Array(readFileSync(fixture('text.pdf')));
    await open(page);
    await pickReady(page, 'text.pdf');
    await field(page).fill(typed);
    const { download, bytes } = await signAndDownload(page);
    expect(download.suggestedFilename()).toBe('text-signed.pdf');
    await expect(page.locator('astro-island section')).toContainText(`${formatSize(bytes.length)}, 3 pages`);
    for (const note of [
      'Your signature is drawn on the page. It is not a digital signature.',
      'Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature already in the file will no longer be valid.',
      'The new file has no password and no restrictions, even if the file you chose had them.',
    ]) {
      await expect(page.getByText(note)).toBeVisible();
    }
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    const before = await texts(input);
    const after = await texts(bytes);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual(before[1]);
    expect(after[2]!.at(-1)).toBe(typed);
    const picturesBefore = await pictures(input);
    const picturesAfter = await pictures(bytes);
    expect(changed(picturesBefore[0]!, picturesAfter[0]!).n).toBe(0);
    expect(changed(picturesBefore[1]!, picturesAfter[1]!).n).toBe(0);
    expect(changed(picturesBefore[2]!, picturesAfter[2]!).n).toBeGreaterThan(20);
    await noSidewaysScroll(page);
  });

  test('progress on pages-500.pdf signed on every page: "Reading the file", then "Page n of 500", then writing, with a bar that never goes back and is not full while writing', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'pages-500.pdf');
    await field(page).fill(typed);
    await page.getByRole('radio', { name: 'Every page' }).check();
    await recordProgress(page);
    await signAndDownload(page);
    const progress = await recorded(page);
    const lines = [...new Set(progress.map((step) => step.line))].filter((line) => line !== 'Starting on 1 file');
    expect(lines[0]).toBe('Reading the file');
    expect(lines.at(-1)).toBe('Writing the signed file');
    const pageLines = lines.slice(1, -1);
    expect(pageLines.length).toBeGreaterThan(0);
    for (const line of pageLines) expect(line).toMatch(/^Page \d{1,3} of 500$/);
    const values = progress.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const step of progress.slice(0, -1)) expect(step.value).toBeLessThan(100);
  });

  test('Cancel stops the job and lists the file again with "Draw it" chosen, the drawing and the choices kept', async ({ page, context }) => {
    await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine('await new Promise(() => {});') }));
    await open(page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Draw it').check();
    await drawWithMouse(page, twoLines);
    await page.getByRole('radio', { name: 'First page' }).check();
    await page.getByRole('radio', { name: 'Top left' }).check();
    await mainButton(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page)).toBeFocused();
    await expect(rows(page)).toContainText('text.pdf');
    await expect(way(page, 'Draw it')).toBeChecked();
    await expect.poll(() => painted(page, 0.5, 0.85)).toBe(true);
    await expect(page.getByRole('radio', { name: 'First page' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Top left' })).toBeChecked();
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(resultHeading(page)).toHaveCount(0);
  });

  test('"Choose another file" keeps the way, the name and the choices; "Start again" sets every one to its start, with no picture chosen', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pickReady(page, 'text.pdf');
    await field(page).fill('Jane Doe');
    await way(page, 'Use a picture of it').check();
    await choosePicture(page).setInputFiles(pictureFile('alpha.png'));
    await expect(chosenLine(page)).toHaveText(/^alpha\.png, /, { timeout: 30000 });
    await page.getByRole('radio', { name: 'Every page' }).check();
    await page.getByRole('radio', { name: 'Top centre' }).check();
    await anotherFile(page).setInputFiles(fixture('mixed.pdf'));
    await waitUntilRead(page, 'mixed.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(way(page, 'Use a picture of it')).toBeChecked();
    await expect(chosenLine(page)).toHaveText(/^alpha\.png, /);
    await expect(page.getByRole('radio', { name: 'Every page' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Top centre' })).toBeChecked();
    await signAndDownload(page);
    await page.getByRole('button', { name: 'Start again' }).click();
    await pickReady(page, 'text.pdf');
    await expect(way(page, 'Type your name')).toBeChecked();
    await expect(field(page)).toHaveValue('');
    await expect(page.getByRole('radio', { name: 'Last page' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Bottom right' })).toBeChecked();
    await expect(mainButton(page)).toHaveAttribute('aria-disabled', 'true');
    await way(page, 'Draw it').check();
    expect(await painted(page, 0.5, 0.85)).toBe(false);
    await way(page, 'Use a picture of it').check();
    await expect(choosePicture(page)).toHaveAccessibleName('Choose a picture');
    await expect(chosenLine(page)).toHaveCount(0);
    await expect(whyNot(page)).toHaveText('Choose a picture of your signature first.');
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password with no option shown; a wrong one says so; the right one opens it with focus on "Type your name"', async ({ page }) => {
    await open(page);
    await pick(page, 'password.pdf');
    const passwordField = page.getByLabel('Password for password.pdf');
    await expect(passwordField).toBeFocused();
    await expect(page.getByText(/stays in (this|your) browser/).first()).toBeVisible();
    await expect(way(page, 'Type your name')).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(0);
    await passwordField.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await expect(passwordField).toBeFocused();
    await passwordField.fill(password);
    await page.keyboard.press('Enter');
    await expect(way(page, 'Type your name')).toBeFocused({ timeout: 30000 });
    await field(page).fill(typed);
    const { bytes } = await signAndDownload(page);
    expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
    expect((await qpdfOn(bytes, ['--show-encryption'])).out).toMatch(/File is not encrypted/);
  });

  test('a damaged file says so, shows no option, and offers to choose another', async ({ page }) => {
    await open(page);
    await pick(page, 'damaged-xref.pdf');
    await expect(page.getByRole('heading', { name: 'damaged-xref.pdf is damaged and cannot be read.' })).toBeVisible();
    await expectRepairLink(page);
    await expect(way(page, 'Type your name')).toHaveCount(0);
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

  for (const [what, thrown, sentence, setUp] of [
    ['the browser runs out of memory', "throw new RangeError('Array buffer allocation failed');", 'Your browser ran out of memory. Try on a computer, or sign the last page only.', 'type'],
    ['the new file would be far too large', "const error = new Error('x'); error.name = 'OutputLimit'; throw error;", outputLimitSentence, 'type'],
    ['the engine refuses the name', "const error = new Error('x'); error.name = 'TextRefused'; throw error;", 'Your name could not be used. Check it and try again.', 'type'],
    ['the engine refuses the drawing', "const error = new Error('x'); error.name = 'DrawingRefused'; throw error;", 'The drawing could not be used. Clear it and draw again.', 'draw'],
    ['the engine refuses the picture', "const error = new Error('x'); error.name = 'PictureRefused'; throw error;", 'The picture could not be used. Choose another picture.', 'picture'],
  ] as const) {
    test(`when ${what}, the page says so; "Go back to your file" keeps the file, the signature and the choices, with focus on the main button`, async ({ page, context }) => {
      await context.route(engineFile, (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine(thrown) }));
      await open(page);
      await pickReady(page, 'text.pdf');
      await page.getByRole('radio', { name: 'First page' }).check();
      if (setUp === 'type') await field(page).fill('Jane Doe');
      else if (setUp === 'draw') {
        await way(page, 'Draw it').check();
        await drawWithMouse(page, twoLines);
      } else {
        await way(page, 'Use a picture of it').check();
        await choosePicture(page).setInputFiles(pictureFile('alpha.png'));
        await expect(chosenLine(page)).toHaveText(/^alpha\.png, /, { timeout: 30000 });
      }
      await mainButton(page).click();
      await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
      await expect(page.getByText(sentence)).toBeVisible();
      await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
      await expect(rows(page)).toContainText('text.pdf');
      await expect(page.getByRole('radio', { name: 'First page' })).toBeChecked();
      if (setUp === 'type') await expect(field(page)).toHaveValue('Jane Doe');
      else if (setUp === 'draw') await expect.poll(() => painted(page, 0.5, 0.85)).toBe(true);
      else await expect(chosenLine(page)).toHaveText(/^alpha\.png, /);
      await expect(mainButton(page)).toBeFocused();
    });
  }

  test('a file over 100 MB shows the notice, and the main button works once a name is typed @desktop', async ({ page }) => {
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(field(page)).toBeVisible({ timeout: 60000 });
    await field(page).fill('Jane Doe');
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a file of 120,000 pages shows the notice; typing and drawing block nothing for more than 100 ms, and signing the last page finishes @desktop', async ({ page }) => {
    test.setTimeout(300_000);
    const path = join(tmpdir(), 'pdfkaro-many-pages.pdf');
    if (!existsSync(path)) execFileSync(process.execPath, [join(here, '../fixtures/make-many-pages.mjs'), tmpdir()], { stdio: 'ignore' });
    await open(page);
    await picker(page).setInputFiles(path);
    await expect(page.getByRole('heading', { name: 'This file has more than 20,000 pages' })).toBeVisible({ timeout: 120000 });
    await expect(way(page, 'Type your name')).toBeFocused({ timeout: 120000 });
    await watchLongTasks(page);
    await field(page).pressSequentially('Jane Doe', { delay: 20 });
    await expect(field(page)).toHaveValue('Jane Doe');
    await way(page, 'Draw it').check();
    await drawWithMouse(page, twoLines);
    await expect(mainButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await longTasks(page)).toEqual([]);
    await way(page, 'Type your name').check();
    await mainButton(page).click();
    await expect(resultHeading(page)).toBeFocused({ timeout: 240000 });
    // The shared page count writes no thousands separator ("120000 pages"), as the file's row does; a site-wide gap noted for the owner.
    await expect(page.locator('astro-island section')).toContainText(/120,?000 pages/);
  });
});

test.describe('the words below the tool', () => {
  test('the heading, sentence, steps and questions are in the served page, before any script runs', async ({ request }) => {
    const html = await (await request.get('/sign-pdf')).text();
    for (const words of [
      'Sign a PDF</h1>',
      'Put your signature on a PDF: type your name, draw it, or use a picture of it. Your file stays on your device.',
      'How to sign a PDF',
      'Press “Sign and download”',
      'Is my file uploaded?',
      'Where can the signature go?',
      'It cannot yet be placed on a signature line in the middle of a page.',
      'Is this a digital signature?',
      'Which characters can I type?',
      'What picture works best?',
      'What does not stay the same?',
      'PDF/A',
    ]) {
      expect(html).toContain(words);
    }
    expect(html).not.toMatch(/How do I sign a PDF\?|How to sign a PDF\?/);
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** Sign PDF's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts): with the drawing step, the picture reader, pdf-lib and fflate. */
const filesAfterPick = () => toolFiles('sign-pdf').all;
const fetchedPaths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))].sort();

/**
 * Every blob: address the browser loaded as a script in each context. Workers start from blob: scripts
 * (src/workers/start-worker.ts), and PDF.js's worker's is made inside the tool worker, out of the page's sight.
 */
const workerScripts = new WeakMap<BrowserContext, Set<string>>();
function trackWorkerScripts(context: BrowserContext) {
  if (workerScripts.has(context)) return;
  const scripts = new Set<string>();
  workerScripts.set(context, scripts);
  context.on('request', (request) => {
    if (request.url().startsWith('blob:') && request.resourceType() === 'script') scripts.add(request.url());
  });
}

/**
 * Watches, from before the page's own scripts run: each Blob given to URL.createObjectURL (its type, size, address,
 * and whether its bytes hold the marker), every image address the page shows, and what each message to a worker
 * carries besides the file (the picture keys of a run, never the bytes).
 */
async function watchPageScripts(context: BrowserContext, marker: string) {
  trackWorkerScripts(context);
  await context.addInitScript((mark) => {
    const made: { type: string; size: number; url: string; marked?: boolean; text?: string }[] = [];
    const shown = new Set<string>();
    const runs: { pictures: string[]; options: string[] }[] = [];
    const scope = window as unknown as { made: typeof made; shown: string[]; runs: typeof runs };
    scope.made = made;
    Object.defineProperty(scope, 'shown', { get: () => [...shown] });
    scope.runs = runs;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      if (object instanceof Blob) {
        const entry: (typeof made)[number] = { type: object.type, size: object.size, url };
        made.push(entry);
        void object.arrayBuffer().then((buffer) => {
          // The tool worker's start script is kept whole, so the test can read that it holds only an import.
          if (object.type === 'text/javascript') entry.text = new TextDecoder().decode(buffer);
          entry.marked = new TextDecoder('latin1').decode(buffer).includes(mark);
        });
      }
      return url;
    };
    new MutationObserver(() => {
      for (const image of document.querySelectorAll('img')) if (image.src) shown.add(image.src);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: unknown[]) {
      const sent = message as { type?: string; pictures?: Record<string, unknown>; options?: Record<string, unknown> } | null;
      if (sent && sent.type === 'run') runs.push({ pictures: Object.keys(sent.pictures ?? {}), options: Object.keys(sent.options ?? {}) });
      return (post as (...args: unknown[]) => void).call(this, message, ...rest);
    } as typeof Worker.prototype.postMessage;
  }, marker);
}

async function pageRecords(page: Page) {
  return page.evaluate(() => {
    const scope = window as unknown as {
      made: { type: string; size: number; url: string; marked?: boolean; text?: string }[];
      shown: string[];
      runs: { pictures: string[]; options: string[] }[];
    };
    return { made: scope.made, shown: scope.shown, runs: scope.runs };
  });
}

/**
 * Every Blob is the result (a PDF), a page thumbnail shown in the row, or the tool worker's start script, which
 * holds only an import of the worker file (src/workers/start-worker.ts); none is the picture: not its size, not its
 * marker; every blob: address fetched was made so, or was loaded as a worker's start script.
 */
async function expectNoPictureBlob(page: Page, seen: Seen[], pictureSize: number) {
  await expect.poll(async () => (await pageRecords(page)).made.every((entry) => entry.marked !== undefined)).toBe(true);
  const { made, shown } = await pageRecords(page);
  expect(made.length).toBeGreaterThan(0);
  for (const entry of made) {
    expect(entry.marked, entry.url).toBe(false);
    expect(entry.size, entry.url).not.toBe(pictureSize);
    if (entry.type === 'application/pdf') continue;
    if (entry.type === 'text/javascript') {
      expect(entry.text, entry.url).toMatch(/^import "http:\/\/localhost:4321\/_astro\/tool\.worker-[A-Za-z0-9_-]{8}\.js";$/);
      continue;
    }
    // An image Blob is only ever a page thumbnail, a PNG the row shows.
    expect(entry.type, entry.url).toBe('image/png');
    expect(shown, entry.url).toContain(entry.url);
  }
  // A blob: address fetched is one the page made, or a worker's start script loaded as a script: PDF.js's worker's
  // is made inside the tool worker by the same helper, which the unit tests and check:worker pin, and never holds file data.
  const addresses = new Set([...made.map((entry) => entry.url), ...(workerScripts.get(page.context()) ?? [])]);
  for (const request of seen.filter((each) => each.url.startsWith('blob:'))) expect(addresses.has(request.url), request.url).toBe(true);
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

const marker = 'qz7mark-SIGNATURE-PICTURE';
const sigPicture = () => asPng('qz7sig.png', markedPng(marker));
const contract = () => ({ name: 'qz7contract.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) });

/** Opens the page in a fresh context, picks the protected file under its telling name and opens it with its password. */
async function freshRun(browser: Browser, viewport: { width: number; height: number } | null) {
  const context = await browser.newContext({ viewport, baseURL: 'http://localhost:4321' });
  await watchPolicy(context);
  await watchPageScripts(context, marker);
  const page = await context.newPage();
  const consoleText: string[] = [];
  page.on('console', (message) => consoleText.push(message.text()));
  await open(page);
  const seen = watch(context, page);
  await pick(page, contract());
  await page.getByLabel(/^Password for /).fill(password);
  await page.keyboard.press('Enter');
  await waitUntilRead(page, 'qz7contract.pdf');
  // The row's thumbnail is drawn by PDF.js in its own worker. Waiting for it means every way fetches the same files,
  // rather than the job ending the worker before PDF.js's worker was fetched.
  await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
  return { context, page, seen, consoleText };
}

test.describe('nothing is uploaded', () => {
  test('a protected file under a telling name, with its password, signed by typing "Jq5name Vx2sig", by drawing and by a picture named qz7sig.png, each in a fresh tab: only the same listed files fetched for the three ways, no body, nothing named, no picture blob', async ({ browser, page: shown, baseURL }) => {
    test.setTimeout(240_000);
    const viewport = shown.viewportSize();
    const pictureBytes = sigPicture().buffer;
    const secrets = ['qz7contract.pdf', 'qz7contract', password, typed, 'Jq5name', 'Vx2sig', 'qz7sig.png', 'qz7sig', marker];
    const fetchedByWay: Record<string, string[]> = {};
    for (const how of ['type', 'draw', 'picture'] as const) {
      const { context, page, seen, consoleText } = await freshRun(browser, viewport);
      if (how === 'type') await field(page).fill(typed);
      else if (how === 'draw') {
        await way(page, 'Draw it').check();
        await drawWithMouse(page, twoLines);
        // Past the pad, so the rest of the job is done as a visitor would, with the page scrolled on.
        await mainButton(page).scrollIntoViewIfNeeded();
      } else {
        await way(page, 'Use a picture of it').check();
        await choosePicture(page).setInputFiles(sigPicture());
        await expect(chosenLine(page)).toHaveText(`qz7sig.png, ${formatSize(pictureBytes.length)}.`, { timeout: 30000 });
      }
      const { download, bytes } = await signAndDownload(page);
      expect(download.suggestedFilename()).toBe('qz7contract-signed.pdf');
      expect((await qpdfOn(bytes, ['--check'])).code).toBe(0);
      expect(Buffer.from(bytes).toString('latin1')).not.toContain(marker);
      await headersRead(seen);
      expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick()), how).toEqual([]);
      // No request had a body, not even after the drawing.
      expect(seen.filter((request) => request.body !== null && request.body !== ''), how).toEqual([]);
      const fetched = fetchedPaths(seen);
      for (const name of [/\/sign-pdf-/, /\/stamp-/, /\/picture-/, /\/pdflib-/, /\/fflate-/]) expect(fetched.some((path) => name.test(path)), `${how}: ${name}`).toBe(true);
      for (const other of [/\/repair-pdf-/, /\/add-page-numbers-/, /\/watermark-pdf-/, /\/compress-pdf-/, /\/compress-to-target-/, /\/shrink-/, /\/split-pdf-/, /\/merge-pdf-/, /\/rotate-pdf-/, /\/images-to-pdf-/, /\/pdf-to-images-/, /\/picture-thumbnail-/, /\/grayscale-pdf-/]) {
        expect(fetched.some((path) => other.test(path)), `${how}: ${other}`).toBe(false);
      }
      fetchedByWay[how] = fetched;
      await expectNoPictureBlob(page, seen, pictureBytes.length);
      const { runs } = await pageRecords(page);
      expect(runs).toHaveLength(1);
      expect(runs[0]!.pictures, how).toEqual(how === 'picture' ? ['picture'] : []);
      // Only the way chosen is sent.
      const sent = runs[0]!.options.filter((key) => ['name', 'drawing'].includes(key));
      expect(sent, how).toEqual(how === 'type' ? ['name'] : how === 'draw' ? ['drawing'] : []);
      await expectNothingHeld(page, context, secrets, consoleText);
      await context.close();
    }
    expect(fetchedByWay.draw).toEqual(fetchedByWay.type);
    expect(fetchedByWay.picture).toEqual(fetchedByWay.type);
  });

  test('after "Start again", the picture is not sent on the next run, and nothing of it was ever given an address', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    await watchPageScripts(context, marker);
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    await open(page);
    const seen = watch(context, page);
    await pickReady(page, 'text.pdf');
    await way(page, 'Use a picture of it').check();
    await choosePicture(page).setInputFiles(sigPicture());
    await expect(chosenLine(page)).toHaveText(/^qz7sig\.png, /, { timeout: 30000 });
    await signAndDownload(page);
    await page.getByRole('button', { name: 'Start again' }).click();
    await pickReady(page, 'text.pdf');
    await field(page).fill('Jane Doe');
    await signAndDownload(page);
    const { runs } = await pageRecords(page);
    expect(runs.map((each) => each.pictures)).toEqual([['picture'], []]);
    await headersRead(seen);
    const secrets = ['qz7sig.png', 'qz7sig', marker, 'Jane Doe'];
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNoPictureBlob(page, seen, sigPicture().buffer.length);
    await expectNothingHeld(page, context, secrets, consoleText);
  });

  test('rich.pdf, tagged.pdf and form.pdf signed: no bookmark title, attachment name, document title, hidden text or field value leaves', async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    const secrets = [
      'Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment',
      'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE',
      'A tagged file', 'A fillable form', 'Sample text', typed, 'Jq5name', 'Vx2sig',
    ];
    await open(page);
    const seen = watch(context, page);
    const consoleText: string[] = [];
    page.on('console', (message) => consoleText.push(message.text()));
    for (const name of ['rich.pdf', 'tagged.pdf', 'form.pdf']) {
      await pickReady(page, name);
      await field(page).fill(typed);
      await signAndDownload(page);
      await page.getByRole('button', { name: 'Start again' }).click();
    }
    await headersRead(seen);
    expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
    await expectNothingHeld(page, context, secrets, consoleText);
  });
});
