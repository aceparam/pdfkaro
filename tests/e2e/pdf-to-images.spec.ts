// PDF to JPG and PDF to PNG in a real browser, at a phone width and a desktop
// width, with the real engine: both pages, choosing a file, a zip of pictures,
// a single picture, what the browser's own pictures hold, every state, the
// keyboard, and the promise that nothing about a file or its password leaves
// the device.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, type Download, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectRepairLink } from './repair-link';
import { unzipSync } from 'fflate';
import { formatSize } from '../../src/widget/format';
import { headersRead, traces, violations, watch, type Seen } from './no-upload';
import { toolFiles } from './tool-files';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, '../fixtures', name);
const password = 'open-sesame';

const pages = [
  {
    path: '/pdf-to-jpg',
    format: 'jpg',
    title: 'Convert PDF to JPG in your browser - PDFkaro',
    heading: 'Convert PDF to JPG',
    sentence: 'Turn each page of a PDF into a JPG picture. Files stay on your device.',
    button: 'Convert to JPG and download',
    note: 'Each page is a JPG picture at 150 pixels to the inch. The PDF itself was not changed.',
    text: 'How to turn PDF pages into JPG pictures',
  },
  {
    path: '/pdf-to-png',
    format: 'png',
    title: 'Convert PDF to PNG in your browser - PDFkaro',
    heading: 'Convert PDF to PNG',
    sentence: 'Turn each page of a PDF into a PNG picture. Files stay on your device.',
    button: 'Convert to PNG and download',
    note: 'Each page is a PNG picture at 150 pixels to the inch, without loss. The PDF itself was not changed.',
    text: 'How to turn PDF pages into PNG pictures',
  },
] as const;
type Shown = (typeof pages)[number];
const [jpgPage, pngPage] = pages;

const picker = (page: Page) => page.locator('input[type=file]').first();
const mainButton = (page: Page, on: Shown) => page.getByRole('button', { name: on.button });
const rows = (page: Page) => page.locator('astro-island ol > li');
const status = (page: Page) => page.locator('[role=status]').first();
const resultHeading = (page: Page) => page.getByRole('heading', { name: 'Your download is ready' });
const failedHeading = (page: Page) => page.getByRole('heading', { name: 'The conversion did not finish.' });
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

async function open(page: Page, on: Shown) {
  await page.goto(on.path);
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
  await expect(rows(page).filter({ hasText: /Getting ready|Trying the password/ })).toHaveCount(0, { timeout: 30000 });
}

async function drop(page: Page, names: string[]) {
  const files = names.map((name) => ({ name, data: readFileSync(fixture(name)).toString('base64') }));
  await page.evaluate((given) => {
    const transfer = new DataTransfer();
    for (const { name, data } of given) transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: 'application/pdf' }));
    for (const type of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}

async function convertAndDownload(page: Page, on: Shown): Promise<{ download: Download; bytes: Uint8Array; type: string }> {
  // The type the browser gives the download is the type of the result the page makes its address from.
  // It is noted as the address is made: the Content Security Policy refuses a fetch of a blob: address.
  await page.evaluate(() => {
    const types = new Map<string, string>();
    (window as unknown as { madeTypes: Map<string, string> }).madeTypes = types;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      if (object instanceof Blob) types.set(url, object.type);
      return url;
    };
  });
  await mainButton(page, on).click();
  await expect(resultHeading(page)).toBeFocused({ timeout: 90000 });
  const link = page.getByRole('link', { name: 'Download' });
  const type = await page.evaluate((href) => (window as unknown as { madeTypes: Map<string, string> }).madeTypes.get(href!) ?? 'no address made', await link.getAttribute('href'));
  const download = page.waitForEvent('download');
  await link.click();
  const done = await download;
  return { download: done, bytes: new Uint8Array(readFileSync((await done.path())!)), type };
}

const isPng = (bytes: Uint8Array) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
const isJpg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/** A PNG's chunks, by type, in order. */
function pngChunks(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: string[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    found.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)));
    at += 12 + length;
  }
  return found;
}

/** A JPG's markers before its first scan, as numbers, and its size from the frame header. */
function jpgSegments(bytes: Uint8Array): { markers: number[]; width: number; height: number } {
  const markers: number[] = [];
  let width = 0;
  let height = 0;
  for (let at = 2; at + 4 <= bytes.length; ) {
    if (bytes[at] !== 0xff) throw new Error('Not a JPG segment.');
    const marker = bytes[at + 1]!;
    markers.push(marker);
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (marker >= 0xc0 && marker <= 0xc3) {
      height = (bytes[at + 5]! << 8) | bytes[at + 6]!;
      width = (bytes[at + 7]! << 8) | bytes[at + 8]!;
    }
    if (marker === 0xda) break;
    at += 2 + length;
  }
  return { markers, width, height };
}

/** A PNG's size, from its header. */
function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const sizeOf = (bytes: Uint8Array, format: 'jpg' | 'png') => {
  if (format === 'png') return pngSize(bytes);
  const { width, height } = jpgSegments(bytes);
  return { width, height };
};

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

test.describe('both pages', () => {
  for (const each of pages) {
    test(`${each.path} has its own title, heading, sentence, text and button, and the picker for one PDF`, async ({ page, request }) => {
      const fetched: string[] = [];
      page.on('request', (sent) => fetched.push(new URL(sent.url()).pathname));
      await open(page, each);
      await expect(page).toHaveTitle(each.title);
      await expect(page.locator('h1')).toHaveText(each.heading);
      await expect(page.getByText(each.sentence)).toBeVisible();
      await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
      await expect(page.getByText('You can also drop a file anywhere on this page, or paste it.')).toBeVisible();
      await expect(picker(page)).toHaveAttribute('accept', 'application/pdf');
      await expect(picker(page)).not.toHaveAttribute('multiple', /.*/);
      // Nothing of the tool loads before a pick.
      expect(fetched.filter((path) => /tool\.worker|pdf-to-images-|thumbnail|pdf\.worker|fflate|ToolWorkspace.*\.js/.test(path))).toEqual([]);
      await noSidewaysScroll(page);
      const html = await (await request.get(each.path)).text();
      for (const words of [each.heading, each.sentence, each.text]) expect(html).toContain(words);
      expect(readFileSync(join(here, '../../src/content/tools', `${each.path.slice(1)}.md`), 'utf8')).toMatch(/^---\nstatus: Draft\. Waiting for the owner to review/);
      // The main button is named after the result once a file is listed.
      await pickReady(page, 'text.pdf');
      await expect(mainButton(page, each)).toBeVisible();
    });
  }

  test('each page answers its own questions, and both say what pictures cannot do', async ({ request }) => {
    const jpg = await (await request.get('/pdf-to-jpg')).text();
    const png = await (await request.get('/pdf-to-png')).text();
    expect(jpg).toContain('Why turn a page into a JPG?');
    expect(jpg).toContain('Why does the text look a little soft?');
    expect(png).toContain('Why choose PNG rather than JPG?');
    expect(png).toContain('Why are the PNG files bigger than my PDF?');
    expect(png).toContain('Can I put a page into a slide or a report?');
    for (const html of [jpg, png]) {
      expect(html).toMatch(/Chinese, Japanese or Korean text may/);
      expect(html).toMatch(/drawn smaller/);
      expect(html).toMatch(/Extract pages/);
    }
    // Each page links to the other, never to itself.
    expect(jpg).toContain('href="/pdf-to-png"');
    expect(jpg).not.toContain('href="/pdf-to-jpg"');
    expect(png).toContain('href="/pdf-to-jpg"');
    expect(png).not.toContain('href="/pdf-to-png"');
  });

  test('the home page lists both under Convert from PDF', async ({ page }) => {
    await page.goto('/');
    const group = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Convert from PDF', exact: true }) }).last();
    for (const [name, path] of [['PDF to JPG', '/pdf-to-jpg'], ['PDF to PNG', '/pdf-to-png']]) {
      await expect(group.getByRole('link', { name: name!, exact: true })).toHaveAttribute('href', path!);
    }
  });
});

test.describe('choosing a file', () => {
  test('lists one row with its first page, pages and size, and no summary line; focus goes to the main button', async ({ page }) => {
    await open(page, jpgPage);
    await pickReady(page, 'text.pdf');
    const size = formatSize(readFileSync(fixture('text.pdf')).length);
    await expect(rows(page)).toContainText('text.pdf');
    await expect(rows(page)).toContainText(`3 pages, ${size}`);
    await expect(rows(page).locator('img')).toHaveCount(1, { timeout: 20000 });
    await expect(mainButton(page, jpgPage)).toBeFocused();
    await expect(status(page)).toHaveText(`text.pdf, 3 pages, ${size}.`);
    await expect(page.locator('label', { hasText: 'Choose another file' })).toBeVisible();
    await noSidewaysScroll(page);
  });

  test('another file replaces the first', async ({ page }) => {
    await open(page, pngPage);
    await pickReady(page, 'text.pdf');
    await pickReady(page, 'mixed.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('mixed.pdf');
  });

  test('two files dropped at once: the first is listed, and the page says the tool takes one file', async ({ page }) => {
    await open(page, pngPage);
    await drop(page, ['text.pdf', 'mixed.pdf']);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('text.pdf');
    await expect(page.locator('p:not([role=status])', { hasText: 'This tool takes one file, so mixed.pdf was not added.' })).toBeVisible();
  });

  test('a file that is not a PDF is refused by name', async ({ page }) => {
    await open(page, jpgPage);
    await pick(page, 'not-a-pdf.pdf');
    await expect(page.getByText('not-a-pdf.pdf is not a PDF, so it was not added.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });
});

test.describe('converting', () => {
  test('a 3-page file to JPG: one zip named after the file, three pictures in order, A4 at 150 to the inch, with progress by page', async ({ page }) => {
    await open(page, jpgPage);
    await pickReady(page, 'text.pdf');
    await recordProgress(page);
    const { download, bytes, type } = await convertAndDownload(page, jpgPage);
    expect(download.suggestedFilename()).toBe('text.zip');
    expect(type).toBe('application/zip');
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(['text-page-1.jpg', 'text-page-2.jpg', 'text-page-3.jpg']);
    for (const picture of Object.values(entries)) {
      expect(isJpg(picture)).toBe(true);
      expect(sizeOf(picture, 'jpg')).toEqual({ width: 1240, height: 1754 });
    }
    await expect(page.locator('astro-island section')).toContainText(`3 files, ${formatSize(bytes.length)}`);
    await expect(page.getByText(jpgPage.note)).toBeVisible();
    // "Page 1 of 3" to "Page 3 of 3", then the zip, with a bar that never goes back.
    const progress = await recorded(page);
    const lines = [...new Set(progress.map((step) => step.line))].filter((line) => line !== 'Starting');
    expect(lines).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3', 'Writing the zip']);
    const values = progress.map((step) => step.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    await noSidewaysScroll(page);
  });

  test('a one-page file to PNG: one picture named after the file, typed as a PNG, with its size alone', async ({ page }) => {
    await open(page, pngPage);
    await pickReady(page, 'form.pdf');
    const { download, bytes, type } = await convertAndDownload(page, pngPage);
    expect(download.suggestedFilename()).toBe('form.png');
    expect(type).toBe('image/png');
    expect(isPng(bytes)).toBe(true);
    expect(pngSize(bytes)).toEqual({ width: 1240, height: 1754 });
    await expect(page.locator('astro-island section div.muted')).toHaveText(formatSize(bytes.length));
    await expect(page.getByText(pngPage.note)).toBeVisible();
  });

  test("mixed.pdf to PNG: each page's size and turn, as a reader shows it", async ({ page }) => {
    await open(page, pngPage);
    await pickReady(page, 'mixed.pdf');
    const { bytes } = await convertAndDownload(page, pngPage);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(['mixed-page-1.png', 'mixed-page-2.png', 'mixed-page-3.png', 'mixed-page-4.png']);
    expect(Object.values(entries).map(pngSize)).toEqual([
      { width: 1240, height: 1754 },
      { width: 1650, height: 1275 },
      { width: 1240, height: 875 },
      { width: 1240, height: 1754 },
    ]);
  });

  test("the browser's own pictures hold only the drawn page: no PNG text chunk, no JPG APP1 or comment, no SECRET- marker", async ({ page }) => {
    for (const on of pages) {
      await open(page, on);
      await pickReady(page, 'tagged.pdf');
      const { bytes } = await convertAndDownload(page, on);
      const entries = unzipSync(bytes);
      expect(Object.keys(entries)).toEqual([`tagged-page-1.${on.format}`, `tagged-page-2.${on.format}`]);
      for (const [name, picture] of Object.entries(entries)) {
        if (on.format === 'png') {
          expect(isPng(picture), name).toBe(true);
          // Only picture chunks, and the colour notes a browser may add: anything else is refused, text chunks among them.
          const chunks = pngChunks(picture);
          const allowed = ['IHDR', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'iCCP', 'cHRM', 'pHYs'];
          expect(chunks.filter((kind) => !allowed.includes(kind)), `${name} ${chunks.join(' ')}`).toEqual([]);
          expect(chunks[0]).toBe('IHDR');
          expect(chunks.at(-1)).toBe('IEND');
        } else {
          expect(isJpg(picture), name).toBe(true);
          // Only the segments that draw the picture, and APP0 (JFIF) and APP2 (a colour profile) a browser may add:
          // anything else is refused, APP1 (EXIF, XMP) and COM (a comment) among them. SOI starts it and EOI ends it.
          const { markers } = jpgSegments(picture);
          const allowed = [0xe0, 0xe2, 0xdb, 0xc0, 0xc1, 0xc2, 0xc4, 0xdd, 0xda];
          expect(markers.filter((marker) => !allowed.includes(marker)), `${name} ${markers.map((marker) => marker.toString(16)).join(' ')}`).toEqual([]);
          expect([picture[0], picture[1], picture.at(-2), picture.at(-1)]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
        }
        expect(Buffer.from(picture).includes('SECRET-'), name).toBe(false);
        expect(Buffer.from(picture).includes('A tagged file'), name).toBe(false);
      }
    }
  });

  test('done by keyboard alone: convert from the main button, then Download from the result', async ({ page }) => {
    await open(page, jpgPage);
    await pickReady(page, 'form.pdf');
    await expect(mainButton(page, jpgPage)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(resultHeading(page)).toBeFocused({ timeout: 30000 });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Download' })).toBeFocused();
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await download).suggestedFilename()).toBe('form.jpg');
    // Start again forgets the file.
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
  });

  test('Cancel during the 500 pages stops the work and lists the file again', async ({ page }) => {
    await open(page, pngPage);
    await pickReady(page, 'pages-500.pdf');
    await mainButton(page, pngPage).click();
    await expect(page.locator('p[class*=progressLine]')).toHaveText(/^Page \d+ of 500$/, { timeout: 30000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(mainButton(page, pngPage)).toBeFocused();
    await expect(rows(page)).toContainText('pages-500.pdf');
    await expect(resultHeading(page)).toHaveCount(0);
  });
});

test.describe('problems with the file', () => {
  test('a protected file asks for its password; a wrong one says so; the right one gives its three pages', async ({ page }) => {
    await open(page, jpgPage);
    await pick(page, 'password.pdf');
    const field = page.getByLabel('Password for password.pdf');
    await expect(field).toBeFocused();
    await expect(page.getByText(/stays in (this|your) browser/).first()).toBeVisible();
    await expect(mainButton(page, jpgPage)).toHaveCount(0);
    await field.fill('not-it');
    await page.keyboard.press('Enter');
    await expect(page.getByText('That password did not open the file. Check it and try again.')).toBeVisible();
    await expect(field).toBeFocused();
    await field.fill(password);
    await page.keyboard.press('Enter');
    await expect(mainButton(page, jpgPage)).toBeFocused();
    const { bytes } = await convertAndDownload(page, jpgPage);
    expect(Object.keys(unzipSync(bytes))).toEqual(['password-page-1.jpg', 'password-page-2.jpg', 'password-page-3.jpg']);
  });

  test('a damaged file says so and offers to choose another', async ({ page }) => {
    await open(page, pngPage);
    await pick(page, 'damaged-xref.pdf');
    await expect(page.getByRole('heading', { name: 'damaged-xref.pdf is damaged and cannot be read.' })).toBeVisible();
    await expectRepairLink(page);
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.locator('label', { hasText: 'Choose a PDF file' })).toBeVisible();
  });

  test('when the engine cannot be fetched, the page says so', async ({ page, context }) => {
    await context.route(/\/_astro\/pdf-to-images-/, (route) => route.abort());
    await open(page, jpgPage);
    await pick(page, 'text.pdf');
    await expect(failedHeading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('The tool could not be loaded. Check your connection and try again.')).toBeVisible();
  });

  /** An engine that reads the file as the real one does, then throws as a hostile file or a phone might. */
  const failingEngine = (thrown: string) =>
    `export const loads = { read: ['qpdf'], job: ['fflate', 'pdfjs'] }; export const inspect = async () => ({ kind: 'ready', pages: 3 }); export const run = async () => { ${thrown} };`;

  test('when the browser runs out of memory, the page says so and what to try, and the file stays listed', async ({ page, context }) => {
    await context.route(/\/_astro\/pdf-to-images-[A-Za-z0-9_-]{8}\.js$/, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: failingEngine("throw new RangeError('Array buffer allocation failed');") }),
    );
    await open(page, pngPage);
    await pickReady(page, 'text.pdf');
    await mainButton(page, pngPage).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('Your browser ran out of memory. Try on a computer, or split the file first and convert the parts.')).toBeVisible();
    await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
    await expect(rows(page)).toContainText('text.pdf');
    await expect(mainButton(page, pngPage)).toBeFocused();
  });

  test('pictures past 1 GB stop the job with their own sentence, keeping the file', async ({ page, context }) => {
    await context.route(/\/_astro\/pdf-to-images-[A-Za-z0-9_-]{8}\.js$/, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: failingEngine("const error = new Error('x'); error.name = 'TooManyPictures'; throw error;") }),
    );
    await open(page, jpgPage);
    await pickReady(page, 'text.pdf');
    await mainButton(page, jpgPage).click();
    await expect(failedHeading(page)).toBeFocused({ timeout: 30000 });
    await expect(page.getByText('The pictures would add up to more than 1 GB, the most this tool makes at once. Use Extract pages or Split PDF first, then convert the parts.')).toBeVisible();
    await page.getByRole('button', { name: 'Go back to your file', exact: true }).click();
    await expect(rows(page)).toContainText('text.pdf');
  });

  test('a file over 100 MB shows the notice, and the main button works @desktop', async ({ page }) => {
    test.setTimeout(120_000);
    const large = join(tmpdir(), 'pdfkaro-e2e-large.pdf');
    if (!existsSync(large)) execFileSync(process.execPath, [join(here, '../fixtures/make-large.mjs'), large], { stdio: 'ignore' });
    await open(page, jpgPage);
    await picker(page).setInputFiles(large);
    await expect(page.getByRole('heading', { name: 'This file is more than 100 MB' })).toBeVisible({ timeout: 60000 });
    await expect(mainButton(page, jpgPage)).not.toHaveAttribute('aria-disabled', 'true');
    const { download, type } = await convertAndDownload(page, jpgPage);
    expect(download.suggestedFilename()).toBe('pdfkaro-e2e-large.jpg');
    expect(type).toBe('image/jpeg');
  });
});

// ---------------------------------------------------------------------------
// Nothing is uploaded.

/** The tool's own files that may load after a pick, by exact name, built from its engine's declared libraries (tool-files.ts). No pdf-lib. */
const filesAfterPick = () => toolFiles('pdf-to-images').all;
const fetchedPaths = (seen: Seen[]) => [...new Set(seen.filter((request) => !request.url.startsWith('blob:')).map((request) => new URL(request.url).pathname))];

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

/** A converted result's download, as the visitor would press it, without fetching it from the page. */
async function downloadOnly(page: Page, on: Shown) {
  await mainButton(page, on).click();
  await expect(resultHeading(page)).toBeFocused({ timeout: 90000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  return download;
}

const richSecrets = ['Chapter one', 'Chapter two', 'note.txt', 'Bookmarks, a link and an attachment'];
const taggedSecrets = ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-PAGE-TWO-TEXT', 'SECRET-TAGGED-VALUE', 'SECRET-TAGGED-FIELD', 'SECRET-LINK', 'SECRET-NOTE', 'A tagged file'];
// A font named in the fixtures: text.pdf, rich.pdf and tagged.pdf use Helvetica, which PDF.js draws from the fixed helper data.
const fontSecrets = ['Helvetica', 'LiberationSans'];

test.describe('nothing is uploaded', () => {
  for (const on of pages) {
    test(`${on.path}: rich.pdf under a telling name, tagged.pdf, and password.pdf with its password, each converted and downloaded, with only the listed files fetched`, async ({ page, context, baseURL }) => {
      test.setTimeout(120_000);
      await open(page, on);
      const seen = watch(context, page);
      const consoleText = await watchedRun(page, { name: 'qz7rich.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('rich.pdf')) });
      expect((await downloadOnly(page, on)).suggestedFilename()).toBe('qz7rich.zip');
      await page.getByRole('button', { name: 'Start again' }).click();
      consoleText.push(...(await watchedRun(page, 'tagged.pdf')));
      expect((await downloadOnly(page, on)).suggestedFilename()).toBe('tagged.zip');
      await page.getByRole('button', { name: 'Start again' }).click();
      consoleText.push(...(await watchedRun(page, { name: 'qz7report.pdf', mimeType: 'application/pdf', buffer: readFileSync(fixture('password.pdf')) }, password)));
      expect((await downloadOnly(page, on)).suggestedFilename()).toBe('qz7report.zip');

      const secrets = ['qz7rich.pdf', 'qz7rich', 'qz7report.pdf', 'qz7report', password, ...richSecrets, ...taggedSecrets, ...fontSecrets];
      await headersRead(seen);
      expect(violations(seen, new URL(baseURL!).origin, secrets, filesAfterPick())).toEqual([]);
      const fetched = fetchedPaths(seen);
      // The engine, PDF.js with its worker and data, and fflate were fetched; pdf-lib and the other engines were not.
      for (const name of [/\/pdf-to-images-/, /\/pdf-[A-Za-z0-9_-]{8}\.js$/, /\/pdf\.worker\.min-/, /\/pdfjs-data-/, /\/thumbnail-/, /\/fflate-/]) {
        expect(fetched.some((path) => name.test(path)), String(name)).toBe(true);
      }
      for (const other of [/\/repair-pdf-/, /\/pdflib-/, /\/picture-/, /\/plain-/, /\/split-pdf-/, /\/compress-pdf-/, /\/compress-to-target-/, /\/shrink-/, /\/images-to-pdf-/, /\/grayscale-pdf-/]) expect(fetched.some((path) => other.test(path)), String(other)).toBe(false);
      await page.getByRole('button', { name: 'Start again' }).click();
      await expect(page.locator('astro-island')).not.toContainText('qz7report');
      await expectNothingHeld(page, context, secrets, consoleText);
    });
  }

  // A one-page file and a longer one fetch the same files, fflate among them: uniform-requests.spec.ts compares
  // form.pdf (one page) with text.pdf on both pages, at the pick and at the main button.
});
